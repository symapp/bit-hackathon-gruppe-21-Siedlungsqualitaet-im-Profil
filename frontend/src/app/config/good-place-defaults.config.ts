import type { LayerPreference } from '../models/layer-preference.model';
import {
  clampLayerPreference,
  preferenceFromHandles,
  type PreferenceHandles,
} from '../utils/preference-scoring.util';
import { ZARR_LAYER_DEFINITIONS } from './zarr-layers.config';

export interface GoodPlaceShape extends PreferenceHandles {
  importance: number;
}

const SOFT_FLOOR = 0.2;
const DEALBREAKER_FLOOR = 0.05;

function shape(
  plateauLeft: number,
  plateauRight: number,
  leftZero: number,
  rightZero: number,
  importance: number,
  options?: {
    floor?: number;
    dealbreaker?: boolean;
    plateauLeftFactor?: number;
    plateauRightFactor?: number;
  },
): GoodPlaceShape {
  const floor = options?.dealbreaker ? DEALBREAKER_FLOOR : (options?.floor ?? SOFT_FLOOR);
  const plateauLeftFactor = options?.plateauLeftFactor ?? 1;
  const plateauRightFactor = options?.plateauRightFactor ?? 1;
  return {
    plateauLeft,
    plateauRight,
    leftZero: Math.max(0.02, leftZero),
    rightZero: Math.min(0.98, rightZero),
    floorLeft: Math.min(floor, plateauLeftFactor),
    floorRight: Math.min(floor, plateauRightFactor),
    plateauLeftFactor,
    plateauRightFactor,
    importance,
  };
}

/**
 * Balanced “good place” defaults: main’s tuned plateaus (ÖV/MIV on the right, etc.)
 * plus soft floors and bounded falloff tails from the preference-curve work.
 */
const SENSIBLE_SHAPES: Record<string, GoodPlaceShape> = {
  tranquillity: shape(0.55, 0.85, 0.4, 0.9, 150),
  'population-density': shape(0.35, 0.65, 0.18, 0.78, 80),
  'vacancy-rates': shape(0.25, 0.6, 0.08, 0.8, 55),
  /** Main: plateau on high ÖV-EW (right side of t). */
  'pt-accessibility': shape(0.42, 0.95, 0.2, 0.98, 120),
  /** Main: same high-EW shape as ÖV (not the old low-EW band). */
  'miv-accessibility': shape(0.42, 0.95, 0.2, 0.98, 40),
  'pt-quality': shape(0.55, 0.9, 0.42, 0.96, 100),
  'pt-travel-time': shape(0.4, 0.6, 0.28, 0.72, 110),
  'miv-travel-time': shape(0.25, 0.75, 0.08, 0.88, 60),
  'rail-traffic': shape(0.05, 0.45, 0.02, 0.68, 90, { floor: 0.12 }),
  'road-traffic': shape(0.05, 0.45, 0.02, 0.68, 100, { floor: 0.12 }),
  'landscape-type': shape(0.4, 0.75, 0.22, 0.85, 50, { floor: 0.15 }),
  'solar-potential': shape(0.5, 0.85, 0.35, 0.92, 40, { floor: 0.15 }),
  'tlm-green-trees': shape(0.35, 0.75, 0.2, 0.84, 80),
  'amenity-shopping': shape(0.15, 0.85, 0.02, 0.95, 100),
  'amenity-health': shape(0.15, 0.85, 0.02, 0.95, 80),
  'amenity-pharmacy': shape(0.15, 0.85, 0.02, 0.95, 60),
  'amenity-culture': shape(0.15, 0.85, 0.02, 0.95, 60),
  'amenity-hospital': shape(0.15, 0.85, 0.02, 0.95, 40),
};

const DEFAULT_ENABLED: Record<string, boolean> = {
  'landscape-type': false,
  temperature: false,
};

const FALLBACK_SHAPE = shape(0.35, 0.65, 0.2, 0.78, 100);

export function goodPlaceShapeFromHandles(handles: GoodPlaceShape): LayerPreference {
  const { importance, ...rest } = handles;
  return clampLayerPreference({
    ...preferenceFromHandles(rest),
    enabled: true,
    importance,
  });
}

export function createGoodPlaceLayerPreference(layerId: string): LayerPreference {
  const sensible = SENSIBLE_SHAPES[layerId] ?? FALLBACK_SHAPE;
  const enabled = DEFAULT_ENABLED[layerId] ?? true;
  return clampLayerPreference({
    ...goodPlaceShapeFromHandles(sensible),
    enabled,
  });
}

export function createDefaultLayerPreferences(): Record<string, LayerPreference> {
  return Object.fromEntries(
    ZARR_LAYER_DEFINITIONS.map((d) => [d.id, createGoodPlaceLayerPreference(d.id)]),
  );
}

/** Exported for tests and preset authoring. */
export function getSensibleShape(layerId: string): GoodPlaceShape {
  return SENSIBLE_SHAPES[layerId] ?? FALLBACK_SHAPE;
}
