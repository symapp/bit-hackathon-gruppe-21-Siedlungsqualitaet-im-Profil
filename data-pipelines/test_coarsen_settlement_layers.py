"""Tests for block aggregation used in coarsen_settlement_layers.py."""

from __future__ import annotations

import numpy as np
import xarray as xr

from coarsen_settlement_layers import _block_reduce, AGG_MAX, AGG_MEAN, AGG_MODE


def test_block_mean_10x10_to_2x2() -> None:
    data = np.arange(100, dtype=np.float32).reshape(10, 10)
    da = xr.DataArray(data, dims=("y", "x"), coords={"y": np.arange(10), "x": np.arange(10)})
    coarse = _block_reduce(da, 5, AGG_MEAN)
    assert coarse.shape == (2, 2)


def test_block_mean_10x10_to_1x1() -> None:
    data = np.ones((10, 10), dtype=np.float32)
    da = xr.DataArray(data, dims=("y", "x"), coords={"y": np.arange(10), "x": np.arange(10)})
    coarse = _block_reduce(da, 10, AGG_MEAN)
    assert coarse.shape == (1, 1)
    assert float(coarse.values[0, 0]) == 1.0


def test_block_max() -> None:
    data = np.zeros((10, 10), dtype=np.float32)
    data[3, 4] = 1.0
    da = xr.DataArray(data, dims=("y", "x"), coords={"y": np.arange(10), "x": np.arange(10)})
    coarse = _block_reduce(da, 5, AGG_MAX)
    assert float(coarse.max()) == 1.0


def test_block_mode() -> None:
    data = np.array(
        [
            [1, 1, 1, 2, 2],
            [1, 1, 1, 2, 2],
            [1, 1, 1, 2, 2],
            [1, 1, 1, 2, 2],
            [1, 1, 1, 2, 2],
        ],
        dtype=np.float32,
    )
    da = xr.DataArray(
        data,
        dims=("y", "x"),
        coords={"y": np.arange(5), "x": np.arange(5)},
    )
    coarse = _block_reduce(da, 5, AGG_MODE)
    assert coarse.shape == (1, 1)
    assert float(coarse.values[0, 0]) == 1.0
