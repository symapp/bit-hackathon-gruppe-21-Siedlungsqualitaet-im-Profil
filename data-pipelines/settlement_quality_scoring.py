"""Settlement-quality scoring: Swiss interior fill, 0–1 scores (higher = better), default weights."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

import geopandas as gpd
import numpy as np
import xarray as xr
from rasterio import features

from are_rasterize_lib import OUTPUT_CRS, SWISS_GRID_100M_EDGE_BOUNDS, swiss_100m_grid_coords

SWISS_BOUNDARY_GPKG_URL = (
    "https://data.geo.admin.ch/ch.swisstopo.swissboundaries3d/"
    "swissboundaries3d_2023-01/swissboundaries3d_2023-01_2056.gpkg"
)

FillMode = Literal["nan_only", "nan_and_zero"]


@dataclass(frozen=True)
class QualitySpec:
    """How a GeoZarr layer is turned into a 0–1 settlement-quality score (higher = better)."""

    variable: str
    higher_is_better: bool
    # Raw value written into NaN cells inside Switzerland before scoring.
    raw_interior_fill: float | None = None
    # Quality score for remaining NaN cells inside Switzerland after scoring.
    quality_interior_fill: float = 0.0
    fill_mode: FillMode = "nan_only"
    percentile_cutoff: float | None = 5.0
    # Fixed [min, max] for linear scaling (skips percentile when set).
    scale_range: tuple[float, float] | None = None
    default_weight: int = 100
    default_enabled: bool = True


QUALITY_SPECS: dict[str, QualitySpec] = {
    "tranquillity": QualitySpec(
        variable="tranquillity_index",
        higher_is_better=True,
        raw_interior_fill=0.0,
        percentile_cutoff=None,
        default_weight=150,
    ),
    "population-density": QualitySpec(
        variable="population_density_score",
        higher_is_better=False,
        raw_interior_fill=0.0,
        percentile_cutoff=None,
        default_weight=80,
    ),
    "pt-accessibility": QualitySpec(
        variable="OeV_Erreichb_EW",
        higher_is_better=True,
        raw_interior_fill=0.0,
        fill_mode="nan_and_zero",
        default_weight=120,
    ),
    "miv-accessibility": QualitySpec(
        variable="Strasse_Erreichb_EW",
        higher_is_better=False,
        raw_interior_fill=0.0,
        fill_mode="nan_and_zero",
        default_weight=40,
    ),
    "pt-quality": QualitySpec(
        variable="KLASSE_NUM",
        higher_is_better=True,
        raw_interior_fill=1.0,
        percentile_cutoff=None,
        scale_range=(1.0, 4.0),
        default_weight=100,
    ),
    "pt-travel-time": QualitySpec(
        variable="OeV_Reisezeit_Z",
        higher_is_better=False,
        raw_interior_fill=90.0,
        scale_range=(15.0, 90.0),
        percentile_cutoff=None,
        default_weight=110,
    ),
    "miv-travel-time": QualitySpec(
        variable="Strasse_Reisezeit_Z",
        higher_is_better=False,
        raw_interior_fill=75.0,
        scale_range=(10.0, 75.0),
        percentile_cutoff=None,
        default_weight=60,
    ),
    "rail-traffic": QualitySpec(
        variable="DTV_OEV",
        higher_is_better=False,
        raw_interior_fill=0.0,
        fill_mode="nan_and_zero",
        default_weight=90,
    ),
    "road-traffic": QualitySpec(
        variable="DTV_FZG",
        higher_is_better=False,
        raw_interior_fill=0.0,
        fill_mode="nan_and_zero",
        default_weight=100,
    ),
    "secondary-homes": QualitySpec(
        variable="ZWG_3110",
        higher_is_better=False,
        raw_interior_fill=0.0,
        fill_mode="nan_and_zero",
        default_weight=70,
    ),
    "landscape-type": QualitySpec(
        variable="TYP_NR",
        higher_is_better=True,
        raw_interior_fill=0.0,
        percentile_cutoff=5.0,
        default_weight=50,
        default_enabled=False,
    ),
    "solar-potential": QualitySpec(
        variable="solar_suitability",
        higher_is_better=True,
        raw_interior_fill=1.0,
        percentile_cutoff=None,
        scale_range=(1.0, 5.0),
        default_weight=40,
    ),
    "agglomeration": QualitySpec(
        variable="in_agglomeration",
        higher_is_better=True,
        raw_interior_fill=0.0,
        percentile_cutoff=None,
        scale_range=(0.0, 1.0),
        default_weight=60,
    ),
}


def default_weights() -> dict[str, int]:
    return {metric_id: spec.default_weight for metric_id, spec in QUALITY_SPECS.items()}


def default_enabled() -> dict[str, bool]:
    return {metric_id: spec.default_enabled for metric_id, spec in QUALITY_SPECS.items()}


def _find_country_layer(gpkg_path: Path) -> str:
    import fiona

    for name in fiona.listlayers(gpkg_path):
        upper = name.upper()
        if "LANDESGEBIET" in upper or "LANDESFLAECHE" in upper:
            return name
    raise ValueError(f"No country layer found in {gpkg_path}")


@lru_cache(maxsize=1)
def swiss_interior_mask(*, cache_dir: str | None = None) -> np.ndarray:
    """Boolean (y, x) mask: True for 100 m cell centers inside the Swiss national border."""
    from are_rasterize_lib import download_gpkg

    cache = Path(cache_dir or Path(__file__).parent / "data")
    cache.mkdir(parents=True, exist_ok=True)
    cached_gpkg = cache / "swissboundaries3d_2056.gpkg"

    if cached_gpkg.exists():
        gpkg_path = cached_gpkg
    else:
        downloaded = download_gpkg(SWISS_BOUNDARY_GPKG_URL)
        shutil_copy = cached_gpkg
        import shutil

        shutil.copy(downloaded, shutil_copy)
        downloaded.unlink(missing_ok=True)
        gpkg_path = cached_gpkg

    layer = _find_country_layer(gpkg_path)
    country = gpd.read_file(gpkg_path, layer=layer)
    if country.crs is None or str(country.crs) != OUTPUT_CRS:
        country = country.to_crs(OUTPUT_CRS)

    x, y = swiss_100m_grid_coords()
    xmin, ymin, xmax, ymax = SWISS_GRID_100M_EDGE_BOUNDS
    transform = features.from_bounds(xmin, ymin, xmax, ymax, len(x), len(y))

    shapes = ((geom, 1) for geom in country.geometry if geom is not None)
    raster = features.rasterize(
        shapes,
        out_shape=(len(y), len(x)),
        transform=transform,
        fill=0,
        dtype=np.uint8,
    )
    return raster.astype(bool)


def _needs_fill(da: xr.DataArray, mode: FillMode) -> xr.DataArray:
    if mode == "nan_and_zero":
        return da.isnull() | (da == 0)
    return da.isnull()


def fill_swiss_interior(
    da: xr.DataArray,
    mask: np.ndarray,
    value: float,
    *,
    mode: FillMode = "nan_only",
) -> xr.DataArray:
    missing = _needs_fill(da, mode) & xr.DataArray(mask, dims=da.dims, coords=da.coords)
    return da.where(~missing, value)


def linear_quality_score(
    da: xr.DataArray,
    spec: QualitySpec,
    *,
    percentile_cutoff: float | None = None,
) -> xr.DataArray:
    """Map raw values to 0–1 where 1 = best settlement quality."""
    working = da.astype(np.float32)
    cutoff = spec.percentile_cutoff if percentile_cutoff is None else percentile_cutoff

    if spec.scale_range is not None:
        lo, hi = spec.scale_range
        if hi <= lo:
            scaled = (working > lo).astype(np.float32)
        else:
            scaled = ((working - lo) / (hi - lo)).clip(0.0, 1.0)
    elif cutoff is not None:
        valid = working.values[np.isfinite(working.values)]
        if valid.size == 0:
            scaled = xr.zeros_like(working)
        else:
            p_low = float(np.percentile(valid, cutoff))
            p_high = float(np.percentile(valid, 100.0 - cutoff))
            if p_high <= p_low:
                scaled = (working > p_low).astype(np.float32)
            else:
                scaled = ((working - p_low) / (p_high - p_low)).clip(0.0, 1.0)
    else:
        scaled = working.clip(0.0, 1.0)

    if spec.higher_is_better:
        return scaled.astype(np.float32)
    return (1.0 - scaled).astype(np.float32)


def apply_quality_postprocess(
    dataset: xr.Dataset,
    metric_id: str,
    *,
    percentile_cutoff: float | None = None,
    cache_dir: str | None = None,
) -> xr.Dataset:
    """Fill gaps inside Switzerland and replace the layer variable with a 0–1 quality score."""
    if metric_id not in QUALITY_SPECS:
        raise KeyError(f"Unknown metric_id {metric_id!r}")

    spec = QUALITY_SPECS[metric_id]
    if spec.variable not in dataset:
        raise KeyError(f"Dataset missing variable {spec.variable!r} for {metric_id}")

    mask = swiss_interior_mask(cache_dir=cache_dir)
    da = dataset[spec.variable]

    if spec.raw_interior_fill is not None:
        da = fill_swiss_interior(
            da,
            mask,
            spec.raw_interior_fill,
            mode=spec.fill_mode,
        )

    quality = linear_quality_score(da, spec, percentile_cutoff=percentile_cutoff)
    quality = fill_swiss_interior(
        quality,
        mask,
        spec.quality_interior_fill,
        mode="nan_only",
    )
    quality.attrs.update(
        {
            "settlement_quality": 1,
            "higher_is_better": True,
            "metric_id": metric_id,
        }
    )

    out = dataset.copy(deep=False)
    out[spec.variable] = quality
    return out

