#!/usr/bin/env python3
"""Fetch Leerwohnungsziffer 2025 from BFS mapexplorer and write a 10 m GeoZarr.

For each municipality geocode (BFS Gde-nummer) found in the geocodes raster,
the script fetches the vacancy-rate time series from the BFS mapexplorer API
and extracts the value for the year 2025.

Municipalities with no data receive NaN.

Input
-----
geocodes_municipalities_10m.zarr  — produced by geo_geocodes.py

Output
------
leerwohnungsziffer_municipalities_10m.zarr  — xarray Dataset, variable
"leerwohnungsziffer" (float32).
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Optional

import numpy as np
import requests
import xarray as xr

from are_rasterize_lib import OUTPUT_CRS
from settlement_layer_meta import build_layer_meta, compute_percentile_bounds
from zarr_b2_upload import upload_zarr

# ---------------------------------------------------------------------------
# BFS mapexplorer API
# ---------------------------------------------------------------------------
_BFS_API_TEMPLATE = (
    "https://mapexplorer.bfs.admin.ch/GC_infosel.php"
    "?lang=de&allindics=0&obs=main&nivgeo=polg2025_04_06"
    "&view=map227&codgeo={codgeo}"
    "&dataset=ch_09_03b&indic=leerwohnungsziffer"
)

TARGET_YEAR = "2025"
DATA_KEY = "leerwohnungsziffer"
DATASET_KEY = "ch_09_03b"

DEFAULT_GEOCODES_ZARR = "geocodes_municipalities_10m.zarr"
DEFAULT_OUT = "leerwohnungsziffer_municipalities_10m.zarr"

# Polite delay between API calls (seconds).
REQUEST_DELAY_S = 0.15
REQUEST_TIMEOUT_S = 30


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def fetch_leerwohnungsziffer(codgeo: int, session: requests.Session) -> Optional[float]:
    """Return the Leerwohnungsziffer for *codgeo* in TARGET_YEAR, or None."""
    url = _BFS_API_TEMPLATE.format(codgeo=codgeo)
    try:
        response = session.get(url, timeout=REQUEST_TIMEOUT_S)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        print(f"    WARNING: request failed for codgeo={codgeo}: {exc}")
        return None

    try:
        records = payload["data"][DATASET_KEY]
    except (KeyError, TypeError):
        return None

    for record in records:
        if str(record.get("annee")) == TARGET_YEAR:
            value = record.get(DATA_KEY)
            if value is not None:
                return float(value)
    return None


def build_geocode_to_value_map(
    geocodes: np.ndarray,
    *,
    verbose: bool = True,
) -> dict[int, float]:
    """Fetch Leerwohnungsziffer for every unique geocode in *geocodes*."""
    unique_codes = sorted(int(c) for c in np.unique(geocodes) if c > 0)
    total = len(unique_codes)
    print(
        f"Fetching Leerwohnungsziffer ({TARGET_YEAR}) for {total} municipalities ...")

    session = requests.Session()
    session.headers.update({"Accept": "application/json"})

    mapping: dict[int, float] = {}
    missing = 0

    for i, code in enumerate(unique_codes, 1):
        value = fetch_leerwohnungsziffer(code, session)
        if value is not None:
            mapping[code] = value
        else:
            missing += 1
        if verbose and i % 100 == 0:
            print(f"  {i}/{total}  (missing so far: {missing})")
        time.sleep(REQUEST_DELAY_S)

    print(
        f"Done.  {len(mapping)}/{total} municipalities have data for {TARGET_YEAR}.")
    return mapping


# ---------------------------------------------------------------------------
# Raster construction
# ---------------------------------------------------------------------------

def apply_mapping_to_geocodes(
    geocodes_da: xr.DataArray,
    mapping: dict[int, float],
) -> xr.DataArray:
    """Vectorised lookup: replace every geocode with its Leerwohnungsziffer value."""
    codes = geocodes_da.values  # shape (y, x), dtype int32
    result = np.full(codes.shape, np.nan, dtype=np.float32)

    # Build a numpy lookup array sized [max_code + 1].
    max_code = max(mapping.keys()) if mapping else 0
    lut = np.full(max_code + 1, np.nan, dtype=np.float32)
    for code, val in mapping.items():
        lut[code] = val

    mask = (codes > 0) & (codes <= max_code)
    result[mask] = lut[codes[mask]]

    return xr.DataArray(
        result,
        coords=geocodes_da.coords,
        dims=geocodes_da.dims,
        attrs={"long_name": f"Leerwohnungsziffer {TARGET_YEAR}", "units": "%"},
    )


def write_zarr(dataset: xr.Dataset, out: Path) -> None:
    encoding = {
        DATA_KEY: {
            "dtype": "float32",
            "chunks": [512, 512],
        }
    }
    print(f"Writing {out} ...")
    dataset.to_zarr(str(out), mode="w", consolidated=True, encoding=encoding)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            f"Build a 10 m GeoZarr of Leerwohnungsziffer {TARGET_YEAR} by municipality, "
            "fetched from the BFS mapexplorer API."
        )
    )
    parser.add_argument(
        "--geocodes-zarr",
        type=Path,
        default=Path(DEFAULT_GEOCODES_ZARR),
        help=f"Path to the geocodes GeoZarr produced by geo_geocodes.py (default: {DEFAULT_GEOCODES_ZARR}).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(DEFAULT_OUT),
        help=f"Output Zarr path (default: {DEFAULT_OUT}).",
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="Upload to Backblaze B2 after writing.",
    )
    parser.add_argument(
        "--remote-name",
        type=str,
        default=None,
        help="Object prefix inside the B2 bucket (defaults to the .zarr folder name).",
    )
    parser.add_argument(
        "--percentile-cutoff",
        type=float,
        default=5.0,
        help="Percentile cutoff for settlement-layer-meta.json (default: 5.0).",
    )
    args = parser.parse_args()

    # 1. Load geocodes raster.
    print(f"Loading geocodes from {args.geocodes_zarr} ...")
    geocodes_ds = xr.open_zarr(str(args.geocodes_zarr), consolidated=True)
    geocodes_da = geocodes_ds["geocode"]

    # 2. Load values into memory (needed for unique-code extraction).
    geocodes_np = geocodes_da.values

    # 3. Fetch BFS data.
    mapping = build_geocode_to_value_map(geocodes_np)

    # 4. Build result raster.
    print("Applying mapping to geocode raster ...")
    result_da = apply_mapping_to_geocodes(geocodes_da, mapping)
    result_da.name = DATA_KEY

    # Preserve CRS metadata.
    import rioxarray  # noqa: F401
    result_da = result_da.rio.write_crs(OUTPUT_CRS)
    dataset = result_da.to_dataset(name=DATA_KEY)

    # 5. Compute layer metadata.
    p5, p95 = compute_percentile_bounds(
        result_da, percentile_cutoff=args.percentile_cutoff
    )
    meta = build_layer_meta(
        variable=DATA_KEY,
        p5=p5,
        p95=p95,
        higher_is_better=False,
        unit="%",
    )

    # 6. Write zarr.
    write_zarr(dataset, args.out)

    # 7. Write settlement-layer-meta.json sidecar.
    from settlement_layer_meta import write_settlement_layer_meta
    write_settlement_layer_meta(args.out, meta)

    print(f"Success! GeoZarr written to {args.out}")

    if args.upload:
        remote = upload_zarr(args.out, remote_name=args.remote_name)
        print(f"Uploaded to {remote}")


if __name__ == "__main__":
    main()
