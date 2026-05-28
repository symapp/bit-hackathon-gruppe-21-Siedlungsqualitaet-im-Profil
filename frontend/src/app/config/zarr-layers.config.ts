import type { Selector } from '@carbonplan/zarr-layer';
import { environment } from '../../environments/environment';
import type { LocationMetrics } from '../models/metrics.model';

/** LV95 / EPSG:2056 — matches pipeline GeoZarr outputs. */
export const SWISS_LV95_PROJ4 =
  '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +units=m +no_defs';

export type ZarrMetricKey = keyof LocationMetrics;

/** LV95 extent [xMin, yMin, xMax, yMax] for STATPOP 100 m grid (half-cell padding). */
export const STATPOP_LV95_BOUNDS: [number, number, number, number] = [
  2_486_150, 1_075_450, 2_832_050, 1_294_850,
];

export interface ZarrLayerDefinition {
  id: string;
  label: string;
  description: string;
  storePath: string;
  variable: string;
  selector?: Selector;
  /** Source CRS bounds; required when x/y are int64 (zarr-layer cannot read them). */
  bounds?: [number, number, number, number];
  fillValue?: number;
  colormap: string[];
  clim: [number, number];
  metricKey: ZarrMetricKey;
  metricLabel: string;
  metricUnit: string;
  formatValue: (value: number) => string;
  /** Used for the aggregated overview score (0–100). */
  higherIsBetter: boolean;
}

export const DEFAULT_ACTIVE_ZARR_LAYER_ID = 'tranquillity';

/**
 * Color scale limits (`clim`) — tune with `visualize-zarr.py` after uploading new layers.
 */
const CLIM = {
  tranquillity: [-12, 20] as [number, number],
  populationDensity: [0, 20_000] as [number, number],
  ptAccessibility: [50, 3_500] as [number, number],
  roadAccessibility: [50, 3_500] as [number, number],
  ptQuality: [1, 4] as [number, number],
  ptTravelTime: [15, 90] as [number, number],
  roadTravelTime: [10, 75] as [number, number],
  railTraffic: [500, 25_000] as [number, number],
  roadTraffic: [500, 20_000] as [number, number],
  secondaryHomes: [0, 40] as [number, number],
  landscapeType: [1, 40] as [number, number],
  solarSuitability: [1, 5] as [number, number],
  agglomeration: [0, 1] as [number, number],
} as const;

const base = environment.zarrBaseUrl;

export const ZARR_LAYER_DEFINITIONS: ZarrLayerDefinition[] = [
  {
    id: 'tranquillity',
    label: 'Ruhe',
    description: 'BAFU Lärmempfindlichkeitskarte (Ruhegüte)',
    storePath: `${base}/ch_bafu_tranquillity_karte.zarr`,
    variable: 'tranquillity_index',
    selector: { band: 0 },
    colormap: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
    clim: CLIM.tranquillity,
    metricKey: 'tranquillityIndex',
    metricLabel: 'Ruhegüte',
    metricUnit: 'Stufe',
    formatValue: (v) => v.toFixed(1),
    higherIsBetter: true,
  },
  {
    id: 'population-density',
    label: 'Bevölkerungsdichte',
    description: 'BFS STATPOP, Einwohner pro km² (100 m Raster)',
    storePath: `${base}/statpop_population_density_100m.zarr`,
    variable: 'population_density_per_km2',
    bounds: STATPOP_LV95_BOUNDS,
    fillValue: Number.NaN,
    colormap: ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026'],
    clim: CLIM.populationDensity,
    metricKey: 'populationDensityPerKm2',
    metricLabel: 'Bevölkerungsdichte',
    metricUnit: 'Einw./km²',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
    higherIsBetter: false,
  },
  {
    id: 'pt-accessibility',
    label: 'ÖV-Erreichbarkeit',
    description: 'ARE Erreichbarkeitswert ÖV (EW, höher = besser erschlossen)',
    storePath: `${base}/erreichbarkeit_swiss_grid_100m.zarr`,
    variable: 'OeV_Erreichb_EW',
    fillValue: Number.NaN,
    colormap: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
    clim: CLIM.ptAccessibility,
    metricKey: 'publicTransportAccessibility',
    metricLabel: 'ÖV-Erreichbarkeit',
    metricUnit: 'EW',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
    higherIsBetter: true,
  },
  {
    id: 'miv-accessibility',
    label: 'Strassen-Erreichbarkeit',
    description: 'ARE Erreichbarkeit MIV (EW, höher = besser erschlossen)',
    storePath: `${base}/erreichbarkeit_miv_swiss_grid_100m.zarr`,
    variable: 'Strasse_Erreichb_EW',
    fillValue: Number.NaN,
    colormap: ['#fff5f0', '#fcbba1', '#fc9272', '#de2d26', '#67000d'],
    clim: CLIM.roadAccessibility,
    metricKey: 'roadAccessibility',
    metricLabel: 'Strassen-Erreichbarkeit',
    metricUnit: 'EW',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
    higherIsBetter: true,
  },
  {
    id: 'pt-quality',
    label: 'ÖV-Güteklassen',
    description: 'ARE ÖV-Güteklassen (A=4 … D=1, höher = besser)',
    storePath: `${base}/pt_quality_swiss_grid_100m.zarr`,
    variable: 'KLASSE_NUM',
    fillValue: Number.NaN,
    colormap: ['#d73027', '#fc8d59', '#91cf60', '#1a9850'],
    clim: CLIM.ptQuality,
    metricKey: 'publicTransportQuality',
    metricLabel: 'ÖV-Güteklasse',
    metricUnit: 'Stufe',
    formatValue: (v) => v.toFixed(0),
    higherIsBetter: true,
  },
  {
    id: 'pt-travel-time',
    label: 'Reisezeit ÖV',
    description: 'ARE Reisezeit zu den 6 grossen Zentren mit ÖV (Minuten)',
    storePath: `${base}/reisezeit_oev_swiss_grid_100m.zarr`,
    variable: 'OeV_Reisezeit_Z',
    fillValue: Number.NaN,
    colormap: ['#004529', '#41ab5d', '#fee08b', '#f46d43', '#a50026'],
    clim: CLIM.ptTravelTime,
    metricKey: 'publicTransportTravelTimeMin',
    metricLabel: 'Reisezeit ÖV',
    metricUnit: 'min',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
    higherIsBetter: false,
  },
  {
    id: 'miv-travel-time',
    label: 'Reisezeit Auto',
    description: 'ARE Reisezeit zu den 6 grossen Zentren mit Strasse (Minuten)',
    storePath: `${base}/reisezeit_miv_swiss_grid_100m.zarr`,
    variable: 'Strasse_Reisezeit_Z',
    fillValue: Number.NaN,
    colormap: ['#004529', '#41ab5d', '#fee08b', '#f46d43', '#a50026'],
    clim: CLIM.roadTravelTime,
    metricKey: 'roadTravelTimeMin',
    metricLabel: 'Reisezeit Auto',
    metricUnit: 'min',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
    higherIsBetter: false,
  },
  {
    id: 'rail-traffic',
    label: 'Bahn-Belastung',
    description: 'ARE Personenverkehr Bahn (DTV, niedriger = ruhiger)',
    storePath: `${base}/belastung_bahn_swiss_grid_100m.zarr`,
    variable: 'DTV_OEV',
    fillValue: Number.NaN,
    colormap: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'],
    clim: CLIM.railTraffic,
    metricKey: 'railTrafficLoad',
    metricLabel: 'Bahn-Belastung',
    metricUnit: 'DTV',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
    higherIsBetter: false,
  },
  {
    id: 'road-traffic',
    label: 'Strassenverkehr',
    description: 'ARE Verkehrsbelastung Strasse (DTV Fahrzeuge, niedriger = besser)',
    storePath: `${base}/belastung_strasse_swiss_grid_100m.zarr`,
    variable: 'DTV_FZG',
    fillValue: Number.NaN,
    colormap: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'],
    clim: CLIM.roadTraffic,
    metricKey: 'roadTrafficLoad',
    metricLabel: 'Strassenverkehr',
    metricUnit: 'DTV',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
    higherIsBetter: false,
  },
  {
    id: 'secondary-homes',
    label: 'Zweitwohnungsanteil',
    description: 'ARE Wohnungsinventar, Anteil Zweitwohnungen (%, niedriger = besser)',
    storePath: `${base}/zweitwohnungsanteil_swiss_grid_100m.zarr`,
    variable: 'ZWG_3110',
    fillValue: Number.NaN,
    colormap: ['#f7fcf5', '#c2e699', '#74c476', '#238b45', '#00441b'],
    clim: CLIM.secondaryHomes,
    metricKey: 'secondaryHomesRatePct',
    metricLabel: 'Zweitwohnungsanteil',
    metricUnit: '%',
    formatValue: (v) => v.toFixed(1),
    higherIsBetter: false,
  },
  {
    id: 'landscape-type',
    label: 'Landschaftstyp',
    description: 'ARE Landschaftstypologie (Typ-Nr., höher = vielfältigere Kategorie)',
    storePath: `${base}/landschaftstypen_swiss_grid_100m.zarr`,
    variable: 'TYP_NR',
    fillValue: Number.NaN,
    colormap: ['#8c510a', '#d8b365', '#5ab4ac', '#01665e', '#003c30'],
    clim: CLIM.landscapeType,
    metricKey: 'landscapeTypeId',
    metricLabel: 'Landschaftstyp',
    metricUnit: 'Nr.',
    formatValue: (v) => v.toFixed(0),
    higherIsBetter: true,
  },
  {
    id: 'solar-potential',
    label: 'Solar-Potenzial',
    description: 'ARE Solaranlagen Nutzungsaspekte (1–5, höher = günstiger)',
    storePath: `${base}/solar_nutzungsaspekte.zarr`,
    variable: 'solar_suitability',
    selector: { band: 0 },
    fillValue: Number.NaN,
    colormap: ['#fff7bc', '#fec44f', '#d95f0e', '#993404'],
    clim: CLIM.solarSuitability,
    metricKey: 'solarSuitability',
    metricLabel: 'Solar-Eignung',
    metricUnit: 'Stufe',
    formatValue: (v) => v.toFixed(0),
    higherIsBetter: true,
  },
  {
    id: 'agglomeration',
    label: 'Agglomeration',
    description: 'ARE Agglomerationsprogramm (1 = im förderberechtigten Gebiet)',
    storePath: `${base}/agglomeration_swiss_grid_100m.zarr`,
    variable: 'in_agglomeration',
    fillValue: Number.NaN,
    colormap: ['#f0f0f0', '#6366f1'],
    clim: CLIM.agglomeration,
    metricKey: 'inAgglomeration',
    metricLabel: 'Agglomeration',
    metricUnit: '',
    formatValue: (v) => (v >= 1 ? 'ja' : 'nein'),
    higherIsBetter: true,
  },
];

/** Layers that use 0 as nodata in GeoZarr but should be treated as empty in the UI. */
export const ZARR_LAYERS_WITH_NAN_FILL = new Set(
  ZARR_LAYER_DEFINITIONS.filter((d) => d.fillValue === Number.NaN).map((d) => d.id),
);

export const DEFAULT_LAYER_WEIGHT = 100;

export function createDefaultLayerWeights(): Record<string, number> {
  return Object.fromEntries(
    ZARR_LAYER_DEFINITIONS.map((d) => [d.id, DEFAULT_LAYER_WEIGHT]),
  );
}

export function createDefaultLayerEnabled(): Record<string, boolean> {
  return Object.fromEntries(ZARR_LAYER_DEFINITIONS.map((d) => [d.id, true]));
}
