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
  /** i18n key for the layer name, e.g. 'layers.tranquillity.label' */
  labelKey: string;
  /** i18n key for the layer description */
  descriptionKey: string;
  storePath: string;
  variable: string;
  selector?: Selector;
  /** Source CRS bounds; required when x/y are int64 (zarr-layer cannot read them). */
  bounds?: [number, number, number, number];
  fillValue?: number;
  colormap: string[];
  clim: [number, number];
  metricKey: ZarrMetricKey;
  /** i18n key for the metric label shown in the sidebar */
  metricLabelKey: string;
  /** i18n key for the metric unit */
  metricUnitKey: string;
  formatValue: (value: number) => string;
  /** Used for the aggregated overview score (0–100). */
  higherIsBetter: boolean;
}

export const DEFAULT_ACTIVE_ZARR_LAYER_ID = 'tranquillity';

/**
 * Color scale limits (`clim`) derived from pipeline Zarr stats (p5–p95 on finite cells).
 * ÖV uses ARE Erreichbarkeitswert (EW), not travel time — values roughly 1–76k.
 */
const CLIM = {
  tranquillity: [-12, 20] as [number, number],
  populationDensity: [0, 20_000] as [number, number],
  ptAccessibility: [50, 3_500] as [number, number],
} as const;

const base = environment.zarrBaseUrl;

export const ZARR_LAYER_DEFINITIONS: ZarrLayerDefinition[] = [
  {
    id: 'tranquillity',
    labelKey: 'layers.tranquillity.label',
    descriptionKey: 'layers.tranquillity.description',
    storePath: `${base}/ch_bafu_tranquillity_karte.zarr`,
    variable: 'tranquillity_index',
    selector: { band: 0 },
    colormap: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
    clim: CLIM.tranquillity,
    metricKey: 'tranquillityIndex',
    metricLabelKey: 'layers.tranquillity.metricLabel',
    metricUnitKey: 'layers.tranquillity.metricUnit',
    formatValue: (v) => v.toFixed(1),
    higherIsBetter: true,
  },
  {
    id: 'population-density',
    labelKey: 'layers.populationDensity.label',
    descriptionKey: 'layers.populationDensity.description',
    storePath: `${base}/statpop_population_density_100m.zarr`,
    variable: 'population_density_per_km2',
    bounds: STATPOP_LV95_BOUNDS,
    fillValue: Number.NaN,
    colormap: ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026'],
    clim: CLIM.populationDensity,
    metricKey: 'populationDensityPerKm2',
    metricLabelKey: 'layers.populationDensity.metricLabel',
    metricUnitKey: 'layers.populationDensity.metricUnit',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
    higherIsBetter: false,
  },
  {
    id: 'pt-accessibility',
    labelKey: 'layers.ptAccessibility.label',
    descriptionKey: 'layers.ptAccessibility.description',
    storePath: `${base}/erreichbarkeit_swiss_grid_100m.zarr`,
    variable: 'OeV_Erreichb_EW',
    colormap: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
    clim: CLIM.ptAccessibility,
    metricKey: 'publicTransportAccessibility',
    metricLabelKey: 'layers.ptAccessibility.metricLabel',
    metricUnitKey: 'layers.ptAccessibility.metricUnit',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
    higherIsBetter: true,
  },
];

export const DEFAULT_LAYER_WEIGHT = 100;

export function createDefaultLayerWeights(): Record<string, number> {
  return Object.fromEntries(ZARR_LAYER_DEFINITIONS.map((d) => [d.id, DEFAULT_LAYER_WEIGHT]));
}

export function createDefaultLayerEnabled(): Record<string, boolean> {
  return Object.fromEntries(ZARR_LAYER_DEFINITIONS.map((d) => [d.id, true]));
}
