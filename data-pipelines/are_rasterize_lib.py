"""Shared helpers to download ARE/geo.admin.ch sources and write 100 m GeoZarr rasters."""

from __future__ import annotations

import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable

import geopandas as gpd
import rioxarray
from geocube.api.core import make_geocube

DEFAULT_RESOLUTION_M = 100
OUTPUT_CRS = "EPSG:2056"


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
) -> None:
    chunk_cfg = chunks or {"x": 1024, "y": 1024}
    data_array = rioxarray.open_rasterio(url, chunks=chunk_cfg)
    dataset = data_array.to_dataset(name=variable)
    dataset.to_zarr(out, mode="w", consolidated=True)
