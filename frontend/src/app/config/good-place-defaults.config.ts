import type { LayerPreference } from '../models/layer-preference.model';
import { clampLayerPreference } from '../utils/preference-scoring.util';
import { ZARR_LAYER_DEFINITIONS } from './zarr-layers.config';

type TrapezoidDefaults = Pick<
  LayerPreference,
  'rangeMin' | 'rangeMax' | 'falloffLeft' | 'falloffRight' | 'importance'
>;

const SENSIBLE_TRAPEZOID: Record<string, TrapezoidDefaults> = {
  tranquillity: {
    rangeMin: 0.55,
    rangeMax: 0.85,
    falloffLeft: 0.12,
    falloffRight: 0.12,
    importance: 150,
  },
  'population-density': {
    rangeMin: 0.35,
    rangeMax: 0.65,
    falloffLeft: 0.15,
    falloffRight: 0.15,
    importance: 80,
  },
  /** Higher EW = better: plateau on the right, ramp up from poor ÖV on the left. */
  'pt-accessibility': {
    rangeMin: 0.42,
    rangeMax: 0.95,
    falloffLeft: 0.22,
    falloffRight: 0.04,
    importance: 120,
  },
  /** Higher EW = better: plateau on the right (same shape as ÖV). */
  'miv-accessibility': {
    rangeMin: 0.42,
    rangeMax: 0.95,
    falloffLeft: 0.22,
    falloffRight: 0.04,
    importance: 40,
  },
  'pt-quality': {
    rangeMin: 0.55,
    rangeMax: 0.9,
    falloffLeft: 0.1,
    falloffRight: 0.08,
    importance: 100,
  },
  'pt-travel-time': {
    rangeMin: 0.4,
    rangeMax: 0.6,
    falloffLeft: 0.1,
    falloffRight: 0.12,
    importance: 110,
  },
  'miv-travel-time': {
    rangeMin: 0.25,
    rangeMax: 0.75,
    falloffLeft: 0.15,
    falloffRight: 0.18,
    importance: 60,
  },
  'rail-traffic': {
    rangeMin: 0.0,
    rangeMax: 0.45,
    falloffLeft: 0.08,
    falloffRight: 0.12,
    importance: 90,
  },
  'road-traffic': {
    rangeMin: 0.0,
    rangeMax: 0.45,
    falloffLeft: 0.08,
    falloffRight: 0.12,
    importance: 100,
  },
  'landscape-type': {
    rangeMin: 0.4,
    rangeMax: 0.75,
    falloffLeft: 0.15,
    falloffRight: 0.15,
    importance: 50,
  },
  'solar-potential': {
    rangeMin: 0.5,
    rangeMax: 0.85,
    falloffLeft: 0.12,
    falloffRight: 0.1,
    importance: 40,
  },
  'tlm-green-trees': {
    rangeMin: 0.35,
    rangeMax: 0.75,
    falloffLeft: 0.12,
    falloffRight: 0.12,
    importance: 80,
  },
};

const DEFAULT_ENABLED: Record<string, boolean> = {
  'landscape-type': false,
};

export function createGoodPlaceLayerPreference(layerId: string): LayerPreference {
  const sensible = SENSIBLE_TRAPEZOID[layerId] ?? {
    rangeMin: 0.35,
    rangeMax: 0.65,
    falloffLeft: 0.12,
    falloffRight: 0.12,
    importance: 100,
  };
  const enabled = DEFAULT_ENABLED[layerId] ?? true;

  return clampLayerPreference({
    enabled,
    importance: sensible.importance,
    rangeMin: sensible.rangeMin,
    rangeMax: sensible.rangeMax,
    falloffLeft: sensible.falloffLeft,
    falloffRight: sensible.falloffRight,
  });
}

export function createDefaultLayerPreferences(): Record<string, LayerPreference> {
  return Object.fromEntries(
    ZARR_LAYER_DEFINITIONS.map((d) => [d.id, createGoodPlaceLayerPreference(d.id)]),
  );
}
