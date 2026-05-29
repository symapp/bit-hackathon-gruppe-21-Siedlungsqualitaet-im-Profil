import type { LayerPreference, TrapezoidPreference } from '../models/layer-preference.model';
import type { SettlementLayerMeta } from '../models/settlement-layer-meta.model';

export interface NormalizationBounds {
  p5: number;
  p95: number;
  higherIsBetter: boolean;
}

/** Map raw value to preference scale t ∈ [0, 1] (higher t = better for the resident). */
export function normalizeToPreferenceScale(
  raw: number,
  bounds: NormalizationBounds,
): number {
  const { p5, p95, higherIsBetter } = bounds;
  if (!Number.isFinite(raw)) {
    return 0;
  }
  if (p95 <= p5) {
    return higherIsBetter ? (raw >= p5 ? 1 : 0) : raw <= p5 ? 1 : 0;
  }
  const linear = Math.min(1, Math.max(0, (raw - p5) / (p95 - p5)));
  return higherIsBetter ? linear : 1 - linear;
}

/** Inverse: preference t → raw value (for axis labels). */
export function preferenceScaleToRaw(t: number, bounds: NormalizationBounds): number {
  const { p5, p95, higherIsBetter } = bounds;
  const clamped = Math.min(1, Math.max(0, t));
  if (p95 <= p5) {
    return p5;
  }
  const linear = higherIsBetter ? clamped : 1 - clamped;
  return p5 + linear * (p95 - p5);
}

/** Linear trapezoid: 1 on [rangeMin, rangeMax]; independent left/right falloff. */
export function preferenceFactor(t: number, pref: TrapezoidPreference): number {
  const a = Math.min(pref.rangeMin, pref.rangeMax);
  const b = Math.max(pref.rangeMin, pref.rangeMax);
  const deltaLeft = Math.max(0, pref.falloffLeft);
  const deltaRight = Math.max(0, pref.falloffRight);

  if (t >= a && t <= b) {
    return 1;
  }

  if (t < a) {
    if (deltaLeft <= 0) {
      return 0;
    }
    const left = a - deltaLeft;
    if (t <= left) {
      return 0;
    }
    return (t - left) / deltaLeft;
  }

  if (deltaRight <= 0) {
    return 0;
  }
  const right = b + deltaRight;
  if (t >= right) {
    return 0;
  }
  return (right - t) / deltaRight;
}

export function factorScoreFromRaw(
  raw: number,
  bounds: NormalizationBounds,
  pref: LayerPreference,
): number {
  const t = normalizeToPreferenceScale(raw, bounds);
  return 100 * preferenceFactor(t, pref);
}

export function factorScoreFromT(t: number, pref: TrapezoidPreference): number {
  return 100 * preferenceFactor(t, pref);
}

export function metaToNormalizationBounds(meta: SettlementLayerMeta): NormalizationBounds {
  return {
    p5: meta.p5,
    p95: meta.p95,
    higherIsBetter: meta.higherIsBetter,
  };
}

export function climToNormalizationBounds(
  clim: [number, number],
  higherIsBetter: boolean,
): NormalizationBounds {
  return { p5: clim[0], p95: clim[1], higherIsBetter };
}

/** Layer meta p5/p95 when present, otherwise `clim` as percentile fallback. */
export function normalizationBoundsForLayer(
  clim: [number, number],
  higherIsBetter: boolean,
  meta: SettlementLayerMeta | null | undefined,
): NormalizationBounds {
  if (meta) {
    return metaToNormalizationBounds(meta);
  }
  return climToNormalizationBounds(clim, higherIsBetter);
}

/** Raw value clamped to [p5, p95] and mapped to 0–100 (before trapezoid preference). */
export function normalizedRawPercent(raw: number, bounds: NormalizationBounds): number {
  return normalizeToPreferenceScale(raw, bounds) * 100;
}

export interface FactorContribution {
  layerId: string;
  score: number;
  importance: number;
}

export function computePreferenceOverviewScore(
  contributions: readonly FactorContribution[],
): number | null {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const { score, importance } of contributions) {
    if (importance <= 0 || !Number.isFinite(score)) {
      continue;
    }
    weightedSum += score * importance;
    weightTotal += importance;
  }

  if (weightTotal === 0) {
    return null;
  }

  return weightedSum / weightTotal;
}

/** Clamp and order trapezoid parameters after UI edits. */
export function clampLayerPreference(pref: LayerPreference): LayerPreference {
  const rangeMin = Math.min(1, Math.max(0, pref.rangeMin));
  const rangeMax = Math.min(1, Math.max(0, pref.rangeMax));
  const a = Math.min(rangeMin, rangeMax);
  const b = Math.max(rangeMin, rangeMax);
  const minGap = 0.02;
  const rangeMinClamped = b - a < minGap ? Math.max(0, b - minGap) : a;
  const rangeMaxClamped = b - a < minGap ? Math.min(1, rangeMinClamped + minGap) : b;

  const legacyFalloff =
    'falloffWidth' in pref && typeof (pref as { falloffWidth?: number }).falloffWidth === 'number'
      ? (pref as { falloffWidth: number }).falloffWidth
      : undefined;

  const falloffLeft = Math.min(
    Math.max(0.01, pref.falloffLeft ?? legacyFalloff ?? 0.1),
    Math.max(rangeMinClamped, 0.25),
  );
  const falloffRight = Math.min(
    Math.max(0.01, pref.falloffRight ?? legacyFalloff ?? 0.1),
    Math.max(1 - rangeMaxClamped, 0.25),
  );

  return {
    enabled: pref.enabled,
    importance: Math.max(0, pref.importance),
    rangeMin: rangeMinClamped,
    rangeMax: rangeMaxClamped,
    falloffLeft,
    falloffRight,
  };
}

export function preferenceFromHandles(
  plateauLeft: number,
  plateauRight: number,
  leftZero: number,
  rightZero: number,
): LayerPreference {
  const a = Math.min(plateauLeft, plateauRight);
  const b = Math.max(plateauLeft, plateauRight);
  return clampLayerPreference({
    enabled: true,
    importance: 100,
    rangeMin: a,
    rangeMax: b,
    falloffLeft: Math.max(0.01, a - leftZero),
    falloffRight: Math.max(0.01, rightZero - b),
  });
}

export function handlesFromPreference(pref: LayerPreference | TrapezoidPreference): {
  plateauLeft: number;
  plateauRight: number;
  leftZero: number;
  rightZero: number;
} {
  const p = clampLayerPreference(
    'enabled' in pref
      ? pref
      : {
          enabled: true,
          importance: 100,
          rangeMin: pref.rangeMin,
          rangeMax: pref.rangeMax,
          falloffLeft: pref.falloffLeft,
          falloffRight: pref.falloffRight,
        },
  );
  return {
    plateauLeft: p.rangeMin,
    plateauRight: p.rangeMax,
    leftZero: p.rangeMin - p.falloffLeft,
    rightZero: p.rangeMax + p.falloffRight,
  };
}
