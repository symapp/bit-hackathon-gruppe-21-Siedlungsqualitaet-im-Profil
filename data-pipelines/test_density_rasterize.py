"""Tests for BFS STATPOP hectare coordinate → shared grid indexing."""

from __future__ import annotations

import numpy as np

# Keep in sync with are_rasterize_lib.SWISS_GRID_100M_EDGE_BOUNDS (no heavy raster imports).
SWISS_GRID_100M_EDGE_BOUNDS = (2_485_400.0, 1_075_200.0, 2_833_000.0, 1_296_000.0)
CELL_SIZE_M = 100


def statpop_corner_to_indices(
    east: np.ndarray,
    north: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Map STATPOP LV95 south-west corners onto shared 100 m grid indices."""
    xmin, _ymin, _xmax, ymax = SWISS_GRID_100M_EDGE_BOUNDS
    xi = ((east - xmin) // CELL_SIZE_M).astype("int64")
    yi = ((ymax - north) // CELL_SIZE_M).astype("int64")
    return xi, yi


def test_statpop_corners_map_to_distinct_columns() -> None:
    xmin, _ymin, _xmax, ymax = SWISS_GRID_100M_EDGE_BOUNDS

    # Adjacent hectare SW corners must not collapse to the same column (old round() bug).
    east = np.array([xmin, xmin + CELL_SIZE_M], dtype=np.int64)
    north = np.array([ymax, ymax], dtype=np.int64)
    xi, yi = statpop_corner_to_indices(east, north)

    assert xi.tolist() == [0, 1]
    assert yi.tolist() == [0, 0]
