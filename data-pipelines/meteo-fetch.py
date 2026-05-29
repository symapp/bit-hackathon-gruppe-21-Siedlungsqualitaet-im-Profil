"""Fetch current Swiss weather, rasterize to 100 m LV95 GeoZarr, upload to B2.

Sources:
- Open-Meteo: temperature + precipitation
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
import xarray as xr

from are_rasterize_lib import swiss_100m_grid_coords, write_swiss_grid_zarr
from settlement_layer_meta import build_layer_meta
from zarr_b2_upload import (
    BUCKET_NAME,
    create_s3_filesystem,
    credentials_configured,
    upload_zarr,
)

# Sampling grid over Switzerland (WGS84).
_LAT_RANGE = np.arange(45.8, 47.9, 0.25)
_LON_RANGE = np.arange(5.9, 10.6, 0.25)
_LONS_GRID, _LATS_GRID = np.meshgrid(_LON_RANGE, _LAT_RANGE)
SAMPLE_LATS: np.ndarray = _LATS_GRID.ravel()
SAMPLE_LONS: np.ndarray = _LONS_GRID.ravel()

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
ZARR_TEMP_NAME = "meteo_temperature_100m.zarr"
ZARR_PRECIP_NAME = "meteo_precipitation_100m.zarr"
MANIFEST_REMOTE = "meteo_manifest.json"


def fetch_open_meteo(lats: np.ndarray, lons: np.ndarray) -> list[dict]:
    """Fetch current temperature_2m and precipitation for a grid of points."""
    response = requests.get(
        OPEN_METEO_URL,
        params={
            "latitude": ",".join(f"{value:.4f}" for value in lats),
            "longitude": ",".join(f"{value:.4f}" for value in lons),
            "current": "temperature_2m,precipitation",
            "timezone": "Europe/Zurich",
            "forecast_days": 1,
        },
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, list) else [data]


def interpolate_to_swiss_grid(
    lats: np.ndarray,
    lons: np.ndarray,
    values: np.ndarray,
    *,
    fill_missing_with_nearest: bool = False,
) -> np.ndarray:
    """Interpolate point observations onto the 100 m LV95 grid."""
    from scipy.interpolate import griddata
    import pyproj

    finite = np.isfinite(lats) & np.isfinite(lons) & np.isfinite(values)
    if finite.sum() < 3:
        raise ValueError("Too few finite weather samples for interpolation.")

    lats = lats[finite]
    lons = lons[finite]
    values = values[finite]

    transformer = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
    xs, ys = transformer.transform(lons, lats)
    sample_points = np.column_stack([xs, ys])

    x_grid, y_grid = swiss_100m_grid_coords()
    xx, yy = np.meshgrid(x_grid, y_grid)
    target = np.column_stack([xx.ravel(), yy.ravel()])

    grid_values = griddata(sample_points, values, target, method="linear", fill_value=np.nan)

    if fill_missing_with_nearest and np.isnan(grid_values).any():
        missing = np.isnan(grid_values)
        grid_values[missing] = griddata(sample_points, values, target[missing], method="nearest")

    return grid_values.reshape(xx.shape).astype(np.float32)


def build_meteo_dataset(temp_grid: np.ndarray, precip_grid: np.ndarray) -> xr.Dataset:
    x_grid, y_grid = swiss_100m_grid_coords()
    ds = xr.Dataset(
        {
            "temperature_celsius": (["y", "x"], temp_grid),
            "precipitation_mm_h": (["y", "x"], precip_grid),
        },
        coords={"x": x_grid, "y": y_grid},
    )
    return ds.rio.write_crs("EPSG:2056")


def upload_manifest(*, last_updated: str) -> None:
    if not credentials_configured():
        print("B2 credentials not configured — skipping manifest upload.")
        return

    fs = create_s3_filesystem()
    manifest = {
        "last_updated": last_updated,
        "zarr_stores": [ZARR_TEMP_NAME, ZARR_PRECIP_NAME],
    }
    remote = f"{BUCKET_NAME}/{MANIFEST_REMOTE}"
    with fs.open(remote, "w") as file_handle:
        json.dump(manifest, file_handle)
    print(f"Manifest uploaded → s3://{remote}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upload", action="store_true", help="Upload Zarr stores to B2")
    args = parser.parse_args()

    print("Fetching Open-Meteo data for Switzerland...")
    try:
        locations = fetch_open_meteo(SAMPLE_LATS, SAMPLE_LONS)
    except requests.RequestException as exc:
        print(f"ERROR: Open-Meteo request failed: {exc}", file=sys.stderr)
        sys.exit(1)

    lats = np.array([location["latitude"] for location in locations], dtype=np.float64)
    lons = np.array([location["longitude"] for location in locations], dtype=np.float64)
    temps = np.array([location["current"]["temperature_2m"] for location in locations], dtype=np.float32)
    precips = np.array([location["current"]["precipitation"] for location in locations], dtype=np.float32)

    finite_weather = np.isfinite(lats) & np.isfinite(lons) & np.isfinite(temps) & np.isfinite(precips)
    if finite_weather.sum() < 3:
        print("ERROR: Too few finite Open-Meteo samples for interpolation.", file=sys.stderr)
        sys.exit(1)

    print(
        f"  {int(finite_weather.sum())} valid points fetched. "
        f"T: {np.nanmin(temps):.1f}–{np.nanmax(temps):.1f} °C  "
        f"P: {np.nanmin(precips):.2f}–{np.nanmax(precips):.2f} mm/h"
    )

    print("Interpolating to 100 m LV95 grid...")
    temp_grid = interpolate_to_swiss_grid(lats, lons, temps, fill_missing_with_nearest=True)
    precip_grid = interpolate_to_swiss_grid(lats, lons, precips, fill_missing_with_nearest=True)
    ds = build_meteo_dataset(temp_grid, precip_grid)
    temp_meta = build_layer_meta(
        variable="temperature_celsius",
        p5=float(np.nanpercentile(temp_grid, 5)),
        p95=float(np.nanpercentile(temp_grid, 95)),
        higher_is_better=False,
        unit="°C",
    )
    precip_meta = build_layer_meta(
        variable="precipitation_mm_h",
        p5=float(np.nanpercentile(precip_grid, 5)),
        p95=float(np.nanpercentile(precip_grid, 95)),
        higher_is_better=False,
        unit="mm/h",
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        temp_path = Path(tmpdir) / ZARR_TEMP_NAME
        precip_path = Path(tmpdir) / ZARR_PRECIP_NAME

        write_swiss_grid_zarr(ds[["temperature_celsius"]], temp_path, layer_meta=temp_meta)
        write_swiss_grid_zarr(ds[["precipitation_mm_h"]], precip_path, layer_meta=precip_meta)
        print(f"Zarr stores written to {tmpdir}")

        if args.upload:
            upload_zarr(temp_path)
            upload_zarr(precip_path)

    now_iso = datetime.now(tz=timezone.utc).isoformat()
    if args.upload:
        upload_manifest(last_updated=now_iso)

    print(f"Done. last_updated={now_iso}")


if __name__ == "__main__":
    main()
