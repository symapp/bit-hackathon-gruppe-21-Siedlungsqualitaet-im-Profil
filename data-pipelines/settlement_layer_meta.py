"""Write settlement-layer-meta.json sidecars for GeoZarr stores."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import xarray as xr

SETTLEMENT_LAYER_META_FILENAME = "settlement-layer-meta.json"


def compute_percentile_bounds(
    da: xr.DataArray,
    *,
    percentile_cutoff: float = 5.0,
    mask: np.ndarray | None = None,
) -> tuple[float, float]:
    """Return (p_low, p_high) for valid cells (optionally masked to Swiss interior)."""
    values = da.values.astype(np.float64)
    if mask is not None and mask.shape == values.shape:
        values = values[mask]
    else:
        values = values.ravel()

    valid = values[np.isfinite(values)]
    if valid.size == 0:
        return 0.0, 1.0

    p_low = float(np.percentile(valid, percentile_cutoff))
    p_high = float(np.percentile(valid, 100.0 - percentile_cutoff))
    if p_high <= p_low:
        p_high = p_low + 1.0
    return p_low, p_high


def build_layer_meta(
    *,
    variable: str,
    p5: float,
    p95: float,
    higher_is_better: bool,
    unit: str = "",
) -> dict[str, Any]:
    return {
        "variable": variable,
        "p5": p5,
        "p95": p95,
        "higherIsBetter": higher_is_better,
        "unit": unit,
    }


def write_settlement_layer_meta(
    zarr_dir: Path,
    meta: dict[str, Any],
    *,
    filename: str = SETTLEMENT_LAYER_META_FILENAME,
) -> Path:
    """Write meta JSON next to the Zarr store directory."""
    out = zarr_dir / filename
    out.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return out


def write_meta_for_dataset(
    zarr_dir: Path,
    dataset: xr.Dataset,
    variable: str,
    *,
    higher_is_better: bool,
    unit: str = "",
    percentile_cutoff: float = 5.0,
    mask: np.ndarray | None = None,
) -> Path:
    if variable not in dataset:
        raise KeyError(f"Dataset missing variable {variable!r}")
    p5, p95 = compute_percentile_bounds(
        dataset[variable],
        percentile_cutoff=percentile_cutoff,
        mask=mask,
    )
    meta = build_layer_meta(
        variable=variable,
        p5=p5,
        p95=p95,
        higher_is_better=higher_is_better,
        unit=unit,
    )
    return write_settlement_layer_meta(zarr_dir, meta)
