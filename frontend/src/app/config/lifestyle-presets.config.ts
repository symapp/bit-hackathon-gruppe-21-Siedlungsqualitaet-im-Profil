import type { LayerPreference } from '../models/layer-preference.model';
import {
  goodPlaceShapeFromHandles,
  getSensibleShape,
  type GoodPlaceShape,
} from './good-place-defaults.config';
import { ZARR_LAYER_DEFINITIONS } from './zarr-layers.config';
import { clampLayerPreference } from '../utils/preference-scoring.util';

export type LifestylePresetId =
  | 'balanced'
  | 'urban-transit'
  | 'quiet-green'
  | 'car-oriented'
  | 'family';

export interface LifestylePresetDefinition {
  id: LifestylePresetId;
  labelKey: string;
  descriptionKey: string;
}

export const LIFESTYLE_PRESETS: readonly LifestylePresetDefinition[] = [
  {
    id: 'balanced',
    labelKey: 'presets.balanced.label',
    descriptionKey: 'presets.balanced.description',
  },
  {
    id: 'urban-transit',
    labelKey: 'presets.urbanTransit.label',
    descriptionKey: 'presets.urbanTransit.description',
  },
  {
    id: 'quiet-green',
    labelKey: 'presets.quietGreen.label',
    descriptionKey: 'presets.quietGreen.description',
  },
  {
    id: 'car-oriented',
    labelKey: 'presets.carOriented.label',
    descriptionKey: 'presets.carOriented.description',
  },
  {
    id: 'family',
    labelKey: 'presets.family.label',
    descriptionKey: 'presets.family.description',
  },
] as const;

export const DEFAULT_LIFESTYLE_PRESET_ID: LifestylePresetId = 'balanced';

const PRESET_STORAGE_KEY = 'settlement-quality-lifestyle-preset';

type PresetLayerOverride = Partial<GoodPlaceShape> & {
  enabled?: boolean;
  dealbreaker?: boolean;
};

type PresetOverrides = Partial<Record<string, PresetLayerOverride>>;

/**
 * Data-informed overrides (see docs/PRESET_STATISTICS.md).
 * Urban cores score high ÖV t; alpine/rural score high tranquillity/green and low traffic t.
 */
const PRESET_OVERRIDES: Record<LifestylePresetId, PresetOverrides> = {
  balanced: {},
  'urban-transit': {
    'pt-accessibility': {
      importance: 200,
      plateauLeft: 0.62,
      plateauRight: 0.92,
      leftZero: 0.48,
      rightZero: 0.96,
      plateauLeftFactor: 1,
      plateauRightFactor: 0.85,
      floorLeft: 0.15,
      floorRight: 0.12,
    },
    'pt-quality': {
      importance: 180,
      plateauLeft: 0.58,
      plateauRight: 0.95,
      leftZero: 0.42,
      rightZero: 0.98,
    },
    'pt-travel-time': {
      importance: 170,
      plateauLeft: 0.52,
      plateauRight: 0.78,
      leftZero: 0.38,
      rightZero: 0.88,
      plateauLeftFactor: 1,
      plateauRightFactor: 0.7,
    },
    tranquillity: { importance: 70, enabled: true },
    'miv-accessibility': { importance: 25, enabled: false },
    'miv-travel-time': { importance: 35 },
    'population-density': {
      importance: 90,
      plateauLeft: 0.45,
      plateauRight: 0.82,
      leftZero: 0.28,
      rightZero: 0.9,
    },
    'rail-traffic': { importance: 130, dealbreaker: true, rightZero: 0.62 },
    'road-traffic': { importance: 140, dealbreaker: true, rightZero: 0.6 },
    'tlm-green-trees': { importance: 50 },
  },
  'quiet-green': {
    tranquillity: {
      importance: 220,
      plateauLeft: 0.62,
      plateauRight: 0.92,
      leftZero: 0.45,
      rightZero: 0.96,
      plateauLeftFactor: 1,
      plateauRightFactor: 0.9,
    },
    'tlm-green-trees': {
      importance: 170,
      plateauLeft: 0.5,
      plateauRight: 0.88,
      leftZero: 0.32,
      rightZero: 0.94,
    },
    'rail-traffic': {
      importance: 150,
      plateauLeft: 0.05,
      plateauRight: 0.42,
      leftZero: 0.02,
      rightZero: 0.58,
      dealbreaker: true,
    },
    'road-traffic': {
      importance: 160,
      plateauLeft: 0.05,
      plateauRight: 0.4,
      leftZero: 0.02,
      rightZero: 0.55,
      dealbreaker: true,
    },
    'population-density': {
      importance: 55,
      plateauLeft: 0.12,
      plateauRight: 0.48,
      leftZero: 0.02,
      rightZero: 0.62,
      plateauLeftFactor: 1,
      plateauRightFactor: 0.75,
    },
    'pt-accessibility': { importance: 55 },
    'miv-accessibility': { importance: 35, enabled: false },
    'pt-travel-time': { importance: 45 },
    'miv-travel-time': { importance: 40 },
  },
  'car-oriented': {
    'miv-accessibility': {
      importance: 200,
      plateauLeft: 0.48,
      plateauRight: 0.9,
      leftZero: 0.32,
      rightZero: 0.95,
      plateauLeftFactor: 1,
      plateauRightFactor: 0.88,
    },
    'miv-travel-time': {
      importance: 190,
      plateauLeft: 0.55,
      plateauRight: 0.85,
      leftZero: 0.4,
      rightZero: 0.92,
      plateauLeftFactor: 1,
      plateauRightFactor: 0.8,
    },
    'pt-accessibility': { importance: 35, enabled: false },
    'pt-travel-time': { importance: 40, enabled: false },
    'pt-quality': { importance: 30, enabled: false },
    'population-density': {
      importance: 75,
      plateauLeft: 0.28,
      plateauRight: 0.62,
      leftZero: 0.12,
      rightZero: 0.72,
    },
    tranquillity: { importance: 80 },
    'road-traffic': { importance: 90, rightZero: 0.68 },
    'rail-traffic': { importance: 70 },
  },
  family: {
    'population-density': {
      importance: 140,
      plateauLeft: 0.32,
      plateauRight: 0.68,
      leftZero: 0.15,
      rightZero: 0.78,
      plateauLeftFactor: 1,
      plateauRightFactor: 0.85,
    },
    'pt-accessibility': {
      importance: 150,
      plateauLeft: 0.48,
      plateauRight: 0.82,
      leftZero: 0.3,
      rightZero: 0.9,
    },
    'pt-travel-time': {
      importance: 130,
      plateauLeft: 0.42,
      plateauRight: 0.68,
      leftZero: 0.26,
      rightZero: 0.8,
    },
    tranquillity: {
      importance: 140,
      plateauLeft: 0.52,
      plateauRight: 0.85,
      leftZero: 0.35,
      rightZero: 0.92,
    },
    'tlm-green-trees': {
      importance: 110,
      plateauLeft: 0.38,
      plateauRight: 0.78,
      leftZero: 0.22,
      rightZero: 0.86,
    },
    'landscape-type': { enabled: true, importance: 70 },
    'miv-travel-time': { importance: 90 },
    'road-traffic': { importance: 85 },
  },
};

function mergeShape(base: GoodPlaceShape, override: PresetLayerOverride | undefined): GoodPlaceShape {
  if (!override) {
    return base;
  }
  const { enabled: _e, dealbreaker, ...shapeFields } = override;
  const merged = { ...base, ...shapeFields };
  if (dealbreaker) {
    merged.floorLeft = 0.05;
    merged.floorRight = 0.05;
  }
  merged.leftZero = Math.max(0.02, merged.leftZero);
  merged.rightZero = Math.min(0.98, merged.rightZero);
  merged.floorLeft = Math.min(merged.floorLeft, merged.plateauLeftFactor);
  merged.floorRight = Math.min(merged.floorRight, merged.plateauRightFactor);
  return merged;
}

export function createPreferencesForPreset(
  presetId: LifestylePresetId,
): Record<string, LayerPreference> {
  const overrides = PRESET_OVERRIDES[presetId] ?? {};
  const result: Record<string, LayerPreference> = {};

  for (const def of ZARR_LAYER_DEFINITIONS) {
    const shapeOverride = overrides[def.id];
    const shape = mergeShape(getSensibleShape(def.id), shapeOverride);
    const enabled =
      shapeOverride?.enabled ??
      (def.id === 'landscape-type' ? false : true);
    result[def.id] = clampLayerPreference({
      ...goodPlaceShapeFromHandles(shape),
      enabled,
    });
  }

  return result;
}

export function loadStoredLifestylePresetId(): LifestylePresetId {
  const stored = localStorage.getItem(PRESET_STORAGE_KEY);
  if (stored && LIFESTYLE_PRESETS.some((p) => p.id === stored)) {
    return stored as LifestylePresetId;
  }
  return DEFAULT_LIFESTYLE_PRESET_ID;
}

export function storeLifestylePresetId(presetId: LifestylePresetId): void {
  localStorage.setItem(PRESET_STORAGE_KEY, presetId);
}

export function createInitialLayerPreferences(): Record<string, LayerPreference> {
  return createPreferencesForPreset(loadStoredLifestylePresetId());
}

export function resetPreferencesForActivePreset(): Record<string, LayerPreference> {
  return createPreferencesForPreset(loadStoredLifestylePresetId());
}
