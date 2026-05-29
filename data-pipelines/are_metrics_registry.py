"""ARE / geo.admin.ch settlement-quality metrics (sources, fields, Zarr output names)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import geopandas as gpd

GPKG = "gpkg"
COG = "cog"
ZIP = "zip"


@dataclass(frozen=True)
class AreMetricSpec:
    id: str
    source_type: str
    source_url: str
    variable: str
    zarr_name: str
    layer: str | None = None
    field: str | None = None
    line_buffer_m: float | None = None
    fill: float = 0
    prepare: Callable[[gpd.GeoDataFrame], gpd.GeoDataFrame] | None = None


def _prepare_pt_quality(geodata: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    mapping = {"A": 4, "B": 3, "C": 2, "D": 1}
    geodata = geodata.copy()
    geodata["KLASSE_NUM"] = geodata["KLASSE"].map(mapping).fillna(0)
    return geodata


ARE_METRICS: dict[str, AreMetricSpec] = {
    # --- already used by dedicated scripts; listed for batch rasterize ---
    "pt-accessibility": AreMetricSpec(
        id="pt-accessibility",
        source_type=GPKG,
        source_url="https://data.geo.admin.ch/ch.are.erreichbarkeit-oev/erreichbarkeit-oev/erreichbarkeit-oev_2056.gpkg",
        field="OeV_Erreichb_EW",
        variable="OeV_Erreichb_EW",
        zarr_name="erreichbarkeit_swiss_grid_100m.zarr",
    ),
    # --- ten additional settlement-quality indicators ---
    "miv-accessibility": AreMetricSpec(
        id="miv-accessibility",
        source_type=GPKG,
        source_url="https://data.geo.admin.ch/ch.are.erreichbarkeit-miv/erreichbarkeit-miv/erreichbarkeit-miv_2056.gpkg",
        field="Strasse_Erreichb_EW",
        variable="Strasse_Erreichb_EW",
        zarr_name="erreichbarkeit_miv_swiss_grid_100m.zarr",
    ),
    "pt-quality": AreMetricSpec(
        id="pt-quality",
        source_type=ZIP,
        source_url="https://data.geo.admin.ch/ch.are.gueteklassen_oev/gueteklassen_oev_2026/gueteklassen_oev_2026_2056.gpkg.zip",
        layer="OeV_Gueteklassen_ARE",
        field="KLASSE_NUM",
        variable="KLASSE_NUM",
        zarr_name="pt_quality_swiss_grid_100m.zarr",
        prepare=_prepare_pt_quality,
    ),
    "pt-travel-time": AreMetricSpec(
        id="pt-travel-time",
        source_type=GPKG,
        source_url="https://data.geo.admin.ch/ch.are.reisezeit-oev/reisezeit-oev/reisezeit-oev_2056.gpkg",
        layer="Reisezeit_Erreichbarkeit",
        field="OeV_Reisezeit_Z",
        variable="OeV_Reisezeit_Z",
        zarr_name="reisezeit_oev_swiss_grid_100m.zarr",
    ),
    "miv-travel-time": AreMetricSpec(
        id="miv-travel-time",
        source_type=GPKG,
        source_url="https://data.geo.admin.ch/ch.are.reisezeit-miv/reisezeit-miv/reisezeit-miv_2056.gpkg",
        layer="Reisezeit_Erreichbarkeit",
        field="Strasse_Reisezeit_Z",
        variable="Strasse_Reisezeit_Z",
        zarr_name="reisezeit_miv_swiss_grid_100m.zarr",
    ),
    "rail-traffic": AreMetricSpec(
        id="rail-traffic",
        source_type=GPKG,
        source_url="https://data.geo.admin.ch/ch.are.belastung-personenverkehr-bahn/belastung-personenverkehr-bahn/belastung-personenverkehr-bahn_2056.gpkg",
        field="DTV_OEV",
        variable="DTV_OEV",
        zarr_name="belastung_bahn_swiss_grid_100m.zarr",
        line_buffer_m=200,
    ),
    "road-traffic": AreMetricSpec(
        id="road-traffic",
        source_type=GPKG,
        source_url="https://data.geo.admin.ch/ch.are.belastung-personenverkehr-strasse/belastung-personenverkehr-strasse/belastung-personenverkehr-strasse_2056.gpkg",
        layer="Personen_Gueterverkehr_Strasse",
        field="DTV_FZG",
        variable="DTV_FZG",
        zarr_name="belastung_strasse_swiss_grid_100m.zarr",
        line_buffer_m=100,
    ),
    "secondary-homes": AreMetricSpec(
        id="secondary-homes",
        source_type=GPKG,
        source_url="https://data.geo.admin.ch/ch.are.wohnungsinventar-zweitwohnungsanteil/wohnungsinventar-zweitwohnungsanteil_2026-03/wohnungsinventar-zweitwohnungsanteil_2026-03_2056.gpkg",
        field="ZWG_3110",
        variable="ZWG_3110",
        zarr_name="zweitwohnungsanteil_swiss_grid_100m.zarr",
    ),
    "landscape-type": AreMetricSpec(
        id="landscape-type",
        source_type=GPKG,
        source_url="https://data.geo.admin.ch/ch.are.landschaftstypen/landschaftstypen/landschaftstypen_2056.gpkg",
        field="TYP_NR",
        variable="TYP_NR",
        zarr_name="landschaftstypen_swiss_grid_100m.zarr",
    ),
    "solar-potential": AreMetricSpec(
        id="solar-potential",
        source_type=COG,
        source_url="https://data.geo.admin.ch/ch.are.solaranlagen-nutzungsaspekte/solaranlagen-nutzungsaspekte/solaranlagen-nutzungsaspekte_2056.tif",
        field=None,
        variable="solar_suitability",
        zarr_name="solar_nutzungsaspekte.zarr",
    ),
}

NEW_METRIC_IDS: tuple[str, ...] = (
    "miv-accessibility",
    "pt-quality",
    "pt-travel-time",
    "miv-travel-time",
    "rail-traffic",
    "road-traffic",
    "secondary-homes",
    "landscape-type",
    "solar-potential",
)
