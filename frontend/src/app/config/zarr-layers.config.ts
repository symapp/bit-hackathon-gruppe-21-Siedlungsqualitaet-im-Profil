import type { Selector } from '@carbonplan/zarr-layer';
import { environment } from '../../environments/environment';
import type { LocationMetrics } from '../models/metrics.model';

/** LV95 / EPSG:2056 — matches pipeline GeoZarr outputs. */
export const SWISS_LV95_PROJ4 =
  '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +units=m +no_defs';

export type ZarrMetricKey = keyof LocationMetrics;

export interface ZarrLayerDefinition {
  id: string;
  label: string;
  storePath: string;
  variable: string;
  selector?: Selector;
  colormap: string[];
  clim: [number, number];
  defaultVisible: boolean;
  metricKey: ZarrMetricKey;
  metricLabel: string;
  metricUnit: string;
  formatValue: (value: number) => string;
}

const base = environment.zarrBaseUrl;

export const ZARR_LAYER_DEFINITIONS: ZarrLayerDefinition[] = [
  {
    id: 'tranquillity',
    label: 'Ruhe',
    storePath: `${base}/ch_bafu_tranquillity_karte.zarr`,
    variable: 'tranquillity_index',
    selector: { band: 0 },
    colormap: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
    clim: [1, 5],
    defaultVisible: true,
    metricKey: 'tranquillityIndex',
    metricLabel: 'Ruhegüte',
    metricUnit: 'Stufe',
    formatValue: (v) => v.toFixed(1),
  },
  {
    id: 'population-density',
    label: 'Bevölkerungsdichte',
    storePath: `${base}/statpop_population_density_100m.zarr`,
    variable: 'population_density_per_km2',
    colormap: ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026'],
    clim: [0, 12000],
    defaultVisible: false,
    metricKey: 'populationDensityPerKm2',
    metricLabel: 'Bevölkerungsdichte',
    metricUnit: 'Einw./km²',
    formatValue: (v) => Math.round(v).toLocaleString('de-CH'),
  },
  {
    id: 'pt-accessibility',
    label: 'ÖV-Erreichbarkeit',
    storePath: `${base}/erreichbarkeit_swiss_grid_100m.zarr`,
    variable: 'OeV_Erreichb_EW',
    colormap: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
    clim: [0, 60],
    defaultVisible: false,
    metricKey: 'publicTransportAccessibility',
    metricLabel: 'ÖV-Erreichbarkeit',
    metricUnit: 'Min.',
    formatValue: (v) => Math.round(v).toString(),
  },
];
