import type { ZarrLayerDefinition } from '../config/zarr-layers.config';
import type { LayerPreference } from '../models/layer-preference.model';
import type { SettlementLayerMeta } from '../models/settlement-layer-meta.model';
import type { LocationMetrics } from '../models/metrics.model';
import {
  climToNormalizationBounds,
  computePreferenceOverviewScore,
  factorScoreFromRaw,
  metaToNormalizationBounds,
  normalizeToPreferenceScale,
  type NormalizationBounds,
} from './preference-scoring.util';

export type { NormalizationBounds };

/** @deprecated Use normalizeToPreferenceScale */
export function normalizeMetric(
  value: number,
  clim: [number, number],
  higherIsBetter: boolean,
): number {
  return normalizeToPreferenceScale(value, climToNormalizationBounds(clim, higherIsBetter));
}

export interface ComputeOverviewContext {
  definitions: readonly ZarrLayerDefinition[];
  preferences: Readonly<Record<string, LayerPreference>>;
  metaByLayerId: Readonly<Record<string, SettlementLayerMeta | null>>;
}

function boundsForLayer(
  def: ZarrLayerDefinition,
  meta: SettlementLayerMeta | null | undefined,
): NormalizationBounds {
  if (meta) {
    return metaToNormalizationBounds(meta);
  }
  return climToNormalizationBounds(def.clim, def.higherIsBetter);
}

/**
 * Weighted mean of trapezoid factor scores (0–100) from user preferences.
 */
export function computePreferenceOverview(
  metrics: LocationMetrics,
  ctx: ComputeOverviewContext,
): number | null {
  const contributions: { layerId: string; score: number; importance: number }[] = [];

  for (const def of ctx.definitions) {
    const pref = ctx.preferences[def.id];
    if (!pref || pref.enabled === false || pref.importance <= 0) {
      continue;
    }

    const raw = metrics[def.metricKey];
    if (raw === null) {
      continue;
    }

    const bounds = boundsForLayer(def, ctx.metaByLayerId[def.id]);
    contributions.push({
      layerId: def.id,
      score: factorScoreFromRaw(raw, bounds, pref),
      importance: pref.importance,
    });
  }

  return computePreferenceOverviewScore(contributions);
}

/** @deprecated Use computePreferenceOverview */
export function computeWeightedOverview(
  metrics: LocationMetrics,
  definitions: readonly ZarrLayerDefinition[],
  weights: Readonly<Record<string, number>>,
  enabled: Readonly<Record<string, boolean>>,
): number | null {
  const preferences: Record<string, LayerPreference> = {};
  for (const def of definitions) {
    preferences[def.id] = {
      enabled: enabled[def.id] !== false,
      importance: weights[def.id] ?? 0,
      rangeMin: 0,
      rangeMax: 1,
      falloffLeft: 0,
      falloffRight: 0,
    };
  }
  return computePreferenceOverview(metrics, {
    definitions,
    preferences,
    metaByLayerId: {},
  });
}
