"""Shared helpers to download ARE/geo.admin.ch sources and write 100 m GeoZarr rasters."""

from __future__ import annotations

import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable

import geopandas as gpd
import numpy as np
import rioxarray
import xarray as xr
from geocube.api.core import make_geocube
from rasterio.enums import Resampling

DEFAULT_RESOLUTION_M = 100
OUTPUT_CRS = "EPSG:2056"

# Outer pixel edges of the shared 100 m LV95 grid (matches geocube ARE rasters).
SWISS_GRID_100M_EDGE_BOUNDS = (2_485_400.0, 1_075_200.0, 2_833_000.0, 1_296_000.0)


def swiss_100m_grid_coords() -> tuple[np.ndarray, np.ndarray]:
    """Cell-center x/y coordinates for the shared 100 m settlement-quality grid."""
    xmin, ymin, xmax, ymax = SWISS_GRID_100M_EDGE_BOUNDS
    res = DEFAULT_RESOLUTION_M
    half = res / 2.0
    x = np.arange(xmin + half, xmax - half + 1, res, dtype=np.float64)
    y = np.arange(ymax - half, ymin + half - 1, -res, dtype=np.float64)
    return x, y


def build_swiss_100m_target_grid() -> xr.DataArray:
    x, y = swiss_100m_grid_coords()
    target = xr.DataArray(
        np.zeros((len(y), len(x)), dtype=np.float32),
        coords={"y": y, "x": x},
        dims=("y", "x"),
    )
    return target.rio.write_crs(OUTPUT_CRS)


def align_raster_to_swiss_100m_grid(
    data_array: xr.DataArray,
    *,
    resampling: Resampling = Resampling.nearest,
) -> xr.DataArray:
    """Clip and resample an LV95 raster to the shared 100 m settlement-quality grid."""
    had_band = "band" in data_array.dims
    if had_band and data_array.sizes.get("band", 0) == 1:
        data_array = data_array.squeeze("band", drop=True)

    if data_array.rio.crs is None:
        data_array = data_array.rio.write_crs(OUTPUT_CRS)

    target = build_swiss_100m_target_grid()
    aligned = data_array.rio.reproject_match(target, resampling=resampling)

    if had_band:
        aligned = aligned.expand_dims("band")
    return aligned


def download_file(url: str, suffix: str = "") -> Path:
    with urllib.request.urlopen(url) as response:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            shutil.copyfileobj(response, temp_file)
            return Path(temp_file.name)


def download_gpkg(url: str) -> Path:
    return download_file(url, suffix=".gpkg")


def download_and_extract_gpkg_zip(url: str) -> tuple[Path, Path]:
    """Returns (gpkg_path, temp_dir) — caller must shutil.rmtree(temp_dir)."""
    zip_path = download_file(url, suffix=".zip")
    temp_dir = Path(tempfile.mkdtemp())
    try:
        with zipfile.ZipFile(zip_path, "r") as archive:
            archive.extractall(temp_dir)
    finally:
        zip_path.unlink(missing_ok=True)

    gpkg_files = list(temp_dir.glob("*.gpkg"))
    if not gpkg_files:
        raise FileNotFoundError(f"No .gpkg file found in {url}")
    return gpkg_files[0], temp_dir


def rasterize_vector_field(
    geodata: gpd.GeoDataFrame,
    field: str,
    out: Path,
    *,
    resolution: int = DEFAULT_RESOLUTION_M,
    fill: float = 0,
) -> None:
    aligned_grid = make_geocube(
        vector_data=geodata,
        measurements=[field],
        resolution=(-resolution, resolution),
        output_crs=OUTPUT_CRS,
        fill=fill,
    )
    aligned_grid.to_zarr(out, mode="w")


def prepare_line_geodata(
    geodata: gpd.GeoDataFrame,
    field: str,
    buffer_m: float,
) -> gpd.GeoDataFrame:
    projected = geodata.to_crs(OUTPUT_CRS)
    buffered = projected.copy()
    buffered["geometry"] = projected.geometry.buffer(buffer_m)
    return buffered[[field, "geometry"]]


def rasterize_from_gpkg(
    *,
    url: str,
    field: str,
    out: Path,
    layer: str | None = None,
    resolution: int = DEFAULT_RESOLUTION_M,
    fill: float = 0,
    prepare: Callable[[gpd.GeoDataFrame], gpd.GeoDataFrame] | None = None,
    line_buffer_m: float | None = None,
    zip_url: bool = False,
) -> None:
    cleanup_dir: Path | None = None
    gpkg_path: Path | None = None

    try:
        if zip_url:
            gpkg_path, cleanup_dir = download_and_extract_gpkg_zip(url)
        else:
            gpkg_path = download_gpkg(url)

        geodata = gpd.read_file(gpkg_path, layer=layer) if layer else gpd.read_file(gpkg_path)

        if prepare is not None:
            geodata = prepare(geodata)

        if line_buffer_m is not None:
            geodata = prepare_line_geodata(geodata, field, line_buffer_m)

        rasterize_vector_field(geodata, field, out, resolution=resolution, fill=fill)
    finally:
        if gpkg_path is not None and not zip_url:
            gpkg_path.unlink(missing_ok=True)
        if cleanup_dir is not None:
            shutil.rmtree(cleanup_dir, ignore_errors=True)


def rasterize_from_cog(
    *,
    url: str,
    out: Path,
    variable: str,
    chunks: dict[str, int] | None = None,
    resampling: Resampling = Resampling.nearest,
    align_to_swiss_grid: bool = True,
) -> None:
    chunk_cfg = chunks or {"x": 1024, "y": 1024}
    data_array = rioxarray.open_rasterio(url, chunks=chunk_cfg)
    if align_to_swiss_grid:
        data_array = align_raster_to_swiss_100m_grid(data_array, resampling=resampling)
    dataset = data_array.to_dataset(name=variable)
    dataset.to_zarr(out, mode="w", consolidated=True)
