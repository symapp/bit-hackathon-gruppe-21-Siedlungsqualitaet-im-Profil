"""Unit tests for settlement layer metadata helpers."""

from __future__ import annotations

import numpy as np
import xarray as xr

from settlement_layer_meta import build_layer_meta, compute_percentile_bounds, write_settlement_layer_meta


def test_compute_percentile_bounds() -> None:
    da = xr.DataArray(np.linspace(0.0, 100.0, 1000), dims=("x",))
    p5, p95 = compute_percentile_bounds(da, percentile_cutoff=5.0)
    assert p5 < p95
    assert p5 < 10.0
    assert p95 > 90.0


def test_build_layer_meta_keys() -> None:
    meta = build_layer_meta(
        variable="OeV_Reisezeit_Z",
        p5=15.0,
        p95=90.0,
        higher_is_better=False,
        unit="min",
    )
    assert meta["variable"] == "OeV_Reisezeit_Z"
    assert meta["higherIsBetter"] is False
    assert meta["p5"] == 15.0


def test_write_settlement_layer_meta(tmp_path) -> None:
    zarr_dir = tmp_path / "test.zarr"
    zarr_dir.mkdir()
    meta = build_layer_meta(variable="x", p5=0.0, p95=1.0, higher_is_better=True)
    path = write_settlement_layer_meta(zarr_dir, meta)
    assert path.exists()
    assert "p5" in path.read_text()
