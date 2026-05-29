"""Tests for swissTLM3D green / tree rasterization helpers."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import pytest
from shapely.geometry import Point, Polygon

from tlm_green_trees_config import (
    GREEN_BODENBEDECKUNG_OBJART_NAMES,
    SINGLE_TREE_OBJART_NAMES,
)
from tlm_green_trees_rasterize import (
    _filter_green_polygons,
    _filter_single_trees,
    _is_green_bodenbedeckung,
    _is_single_tree,
    build_composite,
    process_tile,
    rasterize_tlm_green_trees,
)


def test_green_objart_name_filter() -> None:
    assert _is_green_bodenbedeckung("Gehoelzflaeche")
    assert _is_green_bodenbedeckung(12)
    assert not _is_green_bodenbedeckung("Fels")
    assert not _is_green_bodenbedeckung(1)


def test_single_tree_filter() -> None:
    assert _is_single_tree("Einzelbaum")
    assert _is_single_tree(1)
    assert not _is_single_tree("Gebuesch")


def test_filter_green_polygons_dataframe() -> None:
    gdf = gpd.GeoDataFrame(
        {
            "Objektart": ["Gehoelzflaeche", "Fels"],
            "geometry": [
                Polygon([(0, 0), (0, 1), (1, 1), (1, 0)]),
                Polygon([(2, 2), (2, 3), (3, 3), (3, 2)]),
            ],
        },
        crs="EPSG:2056",
    )
    filtered = _filter_green_polygons(gdf)
    assert len(filtered) == 1
    assert filtered.iloc[0]["Objektart"] in GREEN_BODENBEDECKUNG_OBJART_NAMES


def test_filter_single_trees_dataframe() -> None:
    gdf = gpd.GeoDataFrame(
        {
            "ObjectVal": [1, 2],
            "geometry": [Point(0, 0), Point(1, 1)],
        },
        crs="EPSG:2056",
    )
    filtered = _filter_single_trees(gdf)
    assert len(filtered) == 1
    assert filtered.iloc[0]["ObjectVal"] == 1


def test_build_composite_balances_signals() -> None:
    green_area = np.array([[5_000.0, 0.0], [10_000.0, 0.0]], dtype=np.float64)
    tree_count = np.array([[2.0, 0.0], [0.0, 4.0]], dtype=np.float64)
    green_fraction, tree_density, composite = build_composite(green_area, tree_count)
    assert green_fraction[0, 0] == pytest.approx(0.5)
    assert green_fraction[1, 0] == pytest.approx(1.0)
    assert tree_density[0, 0] == pytest.approx(200.0)
    assert composite[1, 0] == pytest.approx(0.5)
    assert 0.0 <= composite[0, 1] <= 1.0


def _write_fixture_tile(path: Path) -> None:
    """Minimal swissTLM3D-like GPKG over a few 100 m cells near Bern (LV95)."""
    origin_x = 2_600_000.0
    origin_y = 1_200_000.0
    green = gpd.GeoDataFrame(
        {"Objektart": ["Gehoelzflaeche"]},
        geometry=[
            Polygon(
                [
                    (origin_x, origin_y),
                    (origin_x + 250, origin_y),
                    (origin_x + 250, origin_y + 250),
                    (origin_x, origin_y + 250),
                ]
            )
        ],
        crs="EPSG:2056",
    )
    trees = gpd.GeoDataFrame(
        {"ObjectVal": [1, 1, 1]},
        geometry=[
            Point(origin_x + 50, origin_y + 50),
            Point(origin_x + 150, origin_y + 50),
            Point(origin_x + 50, origin_y + 150),
        ],
        crs="EPSG:2056",
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    green.to_file(path, layer="TLM_BODENBEDECKUNG", driver="GPKG")
    trees.to_file(path, layer="TLM_EINZELBAUM_GEBUESCH", driver="GPKG", mode="a")


def test_process_tile_on_fixture(tmp_path: Path) -> None:
    tile = tmp_path / "fixture_tile.gpkg"
    _write_fixture_tile(tile)
    green_area, tree_count = process_tile(tile)
    assert green_area.shape == tree_count.shape
    assert float(green_area.max()) > 0
    assert float(tree_count.max()) >= 1


def test_rasterize_fixture_writes_zarr(tmp_path: Path) -> None:
    tiles_dir = tmp_path / "tiles"
    tiles_dir.mkdir()
    _write_fixture_tile(tiles_dir / "tile.gpkg")
    out = tmp_path / "out.zarr"
    rasterize_tlm_green_trees(out, tiles_dir=tiles_dir, download=False, force=True)
    import xarray as xr

    ds = xr.open_zarr(out)
    try:
        assert "green_amenity_index" in ds
        assert float(ds["green_amenity_index"].max()) > 0
    finally:
        ds.close()
