#!/usr/bin/env python3
"""Build 500 m and 1000 m GeoZarr pyramids from existing 100 m settlement-quality layers."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import xarray as xr
from settlement_layer_meta import write_meta_for_dataset

AGG_MEAN = "mean"
AGG_MODE = "mode"
AGG_MAX = "max"

LAYER_AGG: dict[str, str] = {
    "tranquillity": AGG_MEAN,
    "population-density": AGG_MEAN,
    "pt-accessibility": AGG_MEAN,
    "miv-accessibility": AGG_MEAN,
    "pt-quality": AGG_MODE,
    "pt-travel-time": AGG_MEAN,
    "miv-travel-time": AGG_MEAN,
    "rail-traffic": AGG_MEAN,
    "road-traffic": AGG_MEAN,
    "landscape-type": AGG_MODE,
    "solar-potential": AGG_MEAN,
    "tlm-green-trees": AGG_MEAN,
}

LAYER_VARIABLE: dict[str, str] = {
    "tranquillity": "tranquillity_index",
    "population-density": "population_density_score",
    "pt-accessibility": "OeV_Erreichb_EW",
    "miv-accessibility": "Strasse_Erreichb_EW",
    "pt-quality": "KLASSE_NUM",
    "pt-travel-time": "OeV_Reisezeit_Z",
    "miv-travel-time": "Strasse_Reisezeit_Z",
    "rail-traffic": "DTV_OEV",
    "road-traffic": "DTV_FZG",
    "landscape-type": "TYP_NR",
    "solar-potential": "solar_suitability",
    "tlm-green-trees": "green_amenity_index",
}

HIGHER_IS_BETTER: dict[str, bool] = {
    "tranquillity": True,
    "population-density": False,
    "pt-accessibility": True,
    "miv-accessibility": True,
    "pt-quality": True,
    "pt-travel-time": False,
    "miv-travel-time": False,
    "rail-traffic": False,
    "road-traffic": False,
    "landscape-type": True,
    "solar-potential": True,
    "tlm-green-trees": True,
}

LAYER_UNIT: dict[str, str] = {
    "population-density": "Einw./km²",
}


def _block_reduce(da: xr.DataArray, factor: int, how: str) -> xr.DataArray:
    ny_trim = (da.sizes["y"] // factor) * factor
    nx_trim = (da.sizes["x"] // factor) * factor
    trimmed = da.isel(y=slice(0, ny_trim), x=slice(0, nx_trim))

    if how == AGG_MEAN:
        return trimmed.coarsen(y=factor, x=factor, boundary="trim").mean().astype(np.float32)
    if how == AGG_MAX:
        return trimmed.coarsen(y=factor, x=factor, boundary="trim").max().astype(np.float32)

    blocks = trimmed.data.reshape(ny_trim // factor, factor, nx_trim // factor, factor)
    out = _mode_block(blocks)
    coarse = trimmed.coarsen(y=factor, x=factor, boundary="trim").mean()
    return coarse.copy(data=out.astype(np.float32))


def _mode_block(blocks: np.ndarray) -> np.ndarray:
    ny_b, _, nx_b, _ = blocks.shape
    out = np.full((ny_b, nx_b), np.nan, dtype=np.float32)
    for iy in range(ny_b):
        for ix in range(nx_b):
            vals = blocks[iy, :, ix, :].ravel()
            valid = vals[np.isfinite(vals)]
            if valid.size == 0:
                continue
            uniq, counts = np.unique(valid, return_counts=True)
            out[iy, ix] = uniq[np.argmax(counts)]
    return out


def coarsen_layer(
    fine_zarr: Path,
    variable: str,
    out_dir: Path,
    factor: int,
    how: str,
    *,
    higher_is_better: bool,
    unit: str,
) -> None:
    ds = xr.open_zarr(fine_zarr, consolidated=True)
    if variable not in ds:
        raise KeyError(f"{fine_zarr} missing {variable!r}")
    coarse = _block_reduce(ds[variable], factor, how)
    out_ds = coarse.to_dataset(name=variable).load()
    if out_dir.exists():
        import shutil

        shutil.rmtree(out_dir)
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    out_ds.to_zarr(out_dir, mode="w")
    write_meta_for_dataset(
        out_dir,
        out_ds,
        variable,
        higher_is_better=higher_is_better,
        unit=unit,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fine-dir",
        type=Path,
        required=True,
        help="Directory containing 100 m *.zarr folders",
    )
    parser.add_argument(
        "--layer-id",
        choices=sorted(LAYER_AGG.keys()),
        action="append",
        help="Layer to coarsen (default: all with matching zarr)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    fine_dir = args.fine_dir
    layer_ids = args.layer_id or sorted(LAYER_AGG.keys())

    for layer_id in layer_ids:
        variable = LAYER_VARIABLE[layer_id]
        how = LAYER_AGG[layer_id]
        token = layer_id.replace("-", "_")
        matches = [
            p
            for p in fine_dir.glob("*.zarr")
            if token in p.name and "_500m" not in p.name and "_1000m" not in p.name
        ]
        if not matches:
            print(f"skip {layer_id}: no zarr in {fine_dir}")
            continue
        fine_path = sorted(matches, key=lambda p: len(p.name))[0]
        for suffix, factor in (("500m", 5), ("1000m", 10)):
            out = fine_path.parent / f"{fine_path.stem}_{suffix}.zarr"
            print(f"{layer_id} -> {out.name} ({how}, block={factor})")
            if args.dry_run:
                continue
            coarsen_layer(
                fine_path,
                variable,
                out,
                factor,
                how,
                higher_is_better=HIGHER_IS_BETTER[layer_id],
                unit=LAYER_UNIT.get(layer_id, ""),
            )


if __name__ == "__main__":
    main()
