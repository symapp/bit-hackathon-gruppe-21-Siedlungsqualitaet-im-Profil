#!/usr/bin/env python3
"""Verify GeoZarr stores use the shared 100 m LV95 settlement-quality grid."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import xarray as xr

from are_rasterize_lib import SWISS_GRID_100M_EDGE_BOUNDS, swiss_100m_grid_coords
from zarr_b2_upload import (
    BUCKET_NAME,
    create_s3_filesystem,
    credentials_configured,
    discover_zarr_stores_s3,
    s3_storage_options,
)

CANON_X, CANON_Y = swiss_100m_grid_coords()


def grid_matches_canonical(ds: xr.Dataset) -> tuple[bool, str]:
    if "x" not in ds.coords or "y" not in ds.coords:
        return False, "missing x/y coordinates"

    x = ds["x"].values
    y = ds["y"].values
    if len(x) != len(CANON_X) or len(y) != len(CANON_Y):
        return (
            False,
            f"shape mismatch: x={len(x)} y={len(y)} (want {len(CANON_X)} x {len(CANON_Y)})",
        )

    if abs(float(x[0]) - float(CANON_X[0])) > 1 or abs(float(x[-1]) - float(CANON_X[-1])) > 1:
        return False, f"x extent {x[0]}..{x[-1]} != {CANON_X[0]}..{CANON_X[-1]}"

    if abs(float(y[0]) - float(CANON_Y[0])) > 1 or abs(float(y[-1]) - float(CANON_Y[-1])) > 1:
        return False, f"y extent {y[0]}..{y[-1]} != {CANON_Y[0]}..{CANON_Y[-1]}"

    return True, "ok"


def validate_path(path: str, *, storage_options: dict | None = None) -> tuple[bool, str]:
    opts = storage_options or {}
    try:
        ds = xr.open_zarr(path, consolidated=True, storage_options=opts)
    except Exception:
        ds = xr.open_zarr(path, consolidated=False, storage_options=opts or None)
    try:
        return grid_matches_canonical(ds)
    finally:
        ds.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths",
        nargs="*",
        help="Local .zarr paths. If omitted, validates all stores in the B2 bucket.",
    )
    parser.add_argument("--bucket", default=BUCKET_NAME, help="S3 bucket when scanning remote.")
    parser.add_argument("--prefix", default="", help="Optional key prefix in the bucket.")
    args = parser.parse_args()

    failures: list[str] = []

    if args.paths:
        for raw in args.paths:
            path = str(Path(raw).expanduser())
            ok, detail = validate_path(path)
            label = Path(path).name
            status = "OK" if ok else "FAIL"
            print(f"{status:4} {label}: {detail}")
            if not ok:
                failures.append(label)
    else:
        if not credentials_configured():
            print("B2 credentials missing; pass local .zarr paths or configure .env", file=sys.stderr)
            sys.exit(2)

        fs = create_s3_filesystem()
        stores = discover_zarr_stores_s3(fs, args.bucket, args.prefix)
        opts = s3_storage_options()
        print(f"Canonical edge bounds: {SWISS_GRID_100M_EDGE_BOUNDS}\n")

        for uri in sorted(stores):
            name = uri.rstrip("/").split("/")[-1]
            ok, detail = validate_path(uri, storage_options=opts)
            status = "OK" if ok else "FAIL"
            print(f"{status:4} {name}: {detail}")
            if not ok:
                failures.append(name)

    if failures:
        print(f"\n{len(failures)} store(s) off the shared grid.", file=sys.stderr)
        sys.exit(1)

    print("\nAll stores match the shared Swiss 100 m LV95 grid.")


if __name__ == "__main__":
    main()
