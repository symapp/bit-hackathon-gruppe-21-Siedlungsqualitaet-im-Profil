import type { LayerPreference } from '../models/layer-preference.model';
import type { SettlementLayerMeta } from '../models/settlement-layer-meta.model';
import {
  clampLayerPreference,
  normalizationBoundsForLayer,
  normalizeToPreferenceScale,
} from './preference-scoring.util';

export type TinderRating = -2 | -1 | 0 | 1 | 2;

export interface TinderInferenceLayerInput {
  layerId: string;
  clim: [number, number];
  higherIsBetter: boolean;
  meta: SettlementLayerMeta | null;
}

export interface TinderPlaceSample {
  placeId: string;
  rating: TinderRating;
  valuesByLayerId: Readonly<Record<string, number | null>>;
}

export function inferPreferencesFromTinderRatings(
  layers: readonly TinderInferenceLayerInput[],
  samples: readonly TinderPlaceSample[],
): Record<string, LayerPreference> {
  const output: Record<string, LayerPreference> = {};
  for (const layer of layers) {
    output[layer.layerId] = inferLayerPreference(layer, samples);
  }
  return output;
}

function inferLayerPreference(
  layer: TinderInferenceLayerInput,
  samples: readonly TinderPlaceSample[],
): LayerPreference {
  const bounds = normalizationBoundsForLayer(layer.clim, layer.higherIsBetter, layer.meta);
  const pairs = samples
    .map((sample) => {
      const raw = sample.valuesByLayerId[layer.layerId];
      if (raw === null || raw === undefined || !Number.isFinite(raw)) {
        return null;
      }
      return {
        t: normalizeToPreferenceScale(raw, bounds),
        affinity: sample.rating,
      };
    })
    .filter((item): item is { t: number; affinity: TinderRating } => item !== null);

  if (pairs.length < 3) {
    return clampLayerPreference({
      enabled: true,
      importance: 50,
      rangeMin: 0.35,
      rangeMax: 0.65,
      falloffLeft: 0.15,
      falloffRight: 0.15,
    });
  }

  const x = pairs.map((item) => item.t);
  const y = pairs.map((item) => item.affinity);
  const correlation = pearsonCorrelation(x, y);
  const confidence = Math.min(1, Math.abs(correlation) * Math.sqrt(pairs.length / 10));
  const importance = roundToStep(15 + 185 * confidence, 5);
  const oriented = x.map((value) => (correlation >= 0 ? value : 1 - value));
  const weights = pairs.map((item) => Math.max(0, item.affinity));
  const fallbackWeights = pairs.map((item) => (item.affinity + 2) / 4);
  const effectiveWeights = weights.some((weight) => weight > 0) ? weights : fallbackWeights;

  const plateauLeft = weightedQuantile(oriented, effectiveWeights, 0.3);
  const plateauRight = weightedQuantile(oriented, effectiveWeights, 0.7);
  const p10 = weightedQuantile(oriented, effectiveWeights, 0.1);
  const p90 = weightedQuantile(oriented, effectiveWeights, 0.9);
  const spread = Math.max(0.08, p90 - p10);
  const falloff = Math.min(0.35, Math.max(0.08, spread * 0.6));

  const orientedMin = Math.min(plateauLeft, plateauRight);
  const orientedMax = Math.max(plateauLeft, plateauRight);
  const minGap = 0.08;
  const plateauMin = orientedMax - orientedMin < minGap ? Math.max(0, orientedMax - minGap) : orientedMin;
  const plateauMax = orientedMax - orientedMin < minGap ? Math.min(1, plateauMin + minGap) : orientedMax;

  const rangeMin = correlation >= 0 ? plateauMin : 1 - plateauMax;
  const rangeMax = correlation >= 0 ? plateauMax : 1 - plateauMin;

  return clampLayerPreference({
    enabled: importance > 0,
    importance,
    rangeMin,
    rangeMax,
    falloffLeft: falloff,
    falloffRight: falloff,
  });
}

function pearsonCorrelation(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length || x.length < 2) {
    return 0;
  }
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  for (let i = 0; i < x.length; i += 1) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }
  const denominator = Math.sqrt(denominatorX * denominatorY);
  if (denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

function weightedQuantile(
  values: readonly number[],
  weights: readonly number[],
  quantile: number,
): number {
  if (values.length === 0) {
    return 0.5;
  }
  const clampedQuantile = Math.min(1, Math.max(0, quantile));
  const sorted = values
    .map((value, index) => ({ value, weight: Math.max(0, weights[index] ?? 0) }))
    .sort((a, b) => a.value - b.value);

  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    const fallbackIndex = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * clampedQuantile)));
    return sorted[fallbackIndex].value;
  }

  const target = totalWeight * clampedQuantile;
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= target) {
      return item.value;
    }
  }
  return sorted[sorted.length - 1].value;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}
