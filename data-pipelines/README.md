# Data Pipelines

This directory contains Python scripts for processing raw spatial data into normalized **GeoZarr** layers.

## 🛠 Prerequisites

- [uv](https://github.com/astral-sh/uv) (Python package manager)
- Source data in the `data/` directory (not committed to repo).

## 🚀 Usage

### Run All Pipelines
To regenerate and upload all layers to Backblaze B2:

```bash
uv run python run-all-pipelines.py --force --upload
```

### Individual Indicators
You can run specific scripts for individual datasets:

```bash
# Population Density
uv run python density-rasterize.py --upload

# ARE Metrics (multiple indicators)
uv run python rasterize-are-metrics.py all-new --upload

# PT Quality
uv run python pt-quality-rasterize.py --upload
```

## 🏗 Key Components

- **`are_rasterize_lib.py`**: Shared utility functions for rasterizing ARE datasets to the standard 100m grid.
- **`settlement_layer_meta.py`**: Generates JSON metadata (`p5`, `p95`) for each layer to drive frontend normalization.
- **`zarr_b2_upload.py`**: Handles streaming upload of Zarr chunks to Backblaze B2.

## 📐 Standard Grid (EPSG:2056)
Every script ensures the output Zarr matches the standard Swiss grid resolution and extent to allow pixel-perfect stacking in the frontend.
