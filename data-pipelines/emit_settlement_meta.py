#!/usr/bin/env python3
"""Emit settlement-layer-meta.json for existing local GeoZarr stores (no re-rasterize)."""

from __future__ import annotations

import argparse
from pathlib import Path

import xarray as xr

from metric_layer_meta import METRIC_META
from settlement_layer_meta import write_meta_for_dataset

# metric_id -> (zarr folder name, variable)
STORES: dict[str, tuple[str, str]] = {
    "tranquillity": ("ch_bafu_tranquillity_karte.zarr", "tranquillity_index"),
    "population-density": ("statpop_population_density_100m.zarr", "population_density_score"),
    "pt-accessibility": ("erreichbarkeit_swiss_grid_100m.zarr", "OeV_Erreichb_EW"),
    "miv-accessibility": ("erreichbarkeit_miv_swiss_grid_100m.zarr", "Strasse_Erreichb_EW"),
    "pt-quality": ("pt_quality_swiss_grid_100m.zarr", "KLASSE_NUM"),
    "pt-travel-time": ("reisezeit_oev_swiss_grid_100m.zarr", "OeV_Reisezeit_Z"),
    "miv-travel-time": ("reisezeit_miv_swiss_grid_100m.zarr", "Strasse_Reisezeit_Z"),
    "rail-traffic": ("belastung_bahn_swiss_grid_100m.zarr", "DTV_OEV"),
    "road-traffic": ("belastung_strasse_swiss_grid_100m.zarr", "DTV_FZG"),
    "landscape-type": ("landschaftstypen_swiss_grid_100m.zarr", "TYP_NR"),
    "solar-potential": ("solar_nutzungsaspekte.zarr", "solar_suitability"),
    "tlm-green-trees": ("tlm_green_trees_swiss_grid_100m.zarr", "green_amenity_index"),
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Write settlement-layer-meta.json for local Zarr dirs.")
    parser.add_argument("--data-dir", type=Path, default=Path("."), help="Directory containing .zarr folders.")
    parser.add_argument(
        "--metric",
        default="all",
        help="Metric id or 'all'.",
    )
    parser.add_argument("--percentile-cutoff", type=float, default=5.0)
    parser.add_argument("--upload", action="store_true", help="Upload each store to B2 after writing meta.")
    args = parser.parse_args()

    metric_ids = list(STORES.keys()) if args.metric == "all" else [args.metric]

    for metric_id in metric_ids:
        if metric_id not in STORES:
            raise SystemExit(f"Unknown metric {metric_id!r}")
        zarr_name, variable = STORES[metric_id]
        zarr_dir = args.data_dir / zarr_name
        if not zarr_dir.exists():
            print(f"[skip] {zarr_dir} not found")
            continue

        higher, unit = METRIC_META.get(metric_id, (True, ""))
        ds = xr.open_zarr(zarr_dir)
        try:
            if variable not in ds:
                alt = next(iter(ds.data_vars))
                print(f"[warn] {metric_id}: using variable {alt!r} instead of {variable!r}")
                variable = alt
            path = write_meta_for_dataset(
                zarr_dir,
                ds,
                variable,
                higher_is_better=higher,
                unit=unit,
                percentile_cutoff=args.percentile_cutoff,
            )
            print(f"[ok] {metric_id} -> {path}")
        finally:
            ds.close()

        if args.upload:
            from zarr_b2_upload import upload_zarr

            remote = upload_zarr(zarr_dir, remote_name=zarr_name)
            print(f"[upload] {remote}")


if __name__ == "__main__":
    main()
