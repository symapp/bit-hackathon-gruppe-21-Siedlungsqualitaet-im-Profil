import type { CurvePreference, LayerPreference } from '../models/layer-preference.model';
import type { SettlementLayerMeta } from '../models/settlement-layer-meta.model';

export interface NormalizationBounds {
  p5: number;
  p95: number;
  higherIsBetter: boolean;
}

export interface PreferenceHandles {
  plateauLeft: number;
  plateauRight: number;
  plateauLeftFactor: number;
  plateauRightFactor: number;
  leftZero: number;
  rightZero: number;
  floorLeft: number;
  floorRight: number;
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

function plateauFactors(pref: CurvePreference): { left: number; right: number } {
  const legacy = pref.plateauFactor ?? 1;
  const left = Math.min(1, Math.max(0.05, pref.plateauLeftFactor ?? legacy));
  const right = Math.min(1, Math.max(0.05, pref.plateauRightFactor ?? legacy));
  return { left, right };
}

function curveParams(pref: CurvePreference): {
  a: number;
  b: number;
  plateauLeft: number;
  plateauRight: number;
  floorLeft: number;
  floorRight: number;
  deltaLeft: number;
  deltaRight: number;
  left: number;
  right: number;
} {
  const a = Math.min(pref.rangeMin, pref.rangeMax);
  const b = Math.max(pref.rangeMin, pref.rangeMax);
  const { left: plateauLeft, right: plateauRight } = plateauFactors(pref);
  const floorLeft = Math.min(plateauLeft, Math.max(0, pref.floorLeft ?? 0));
  const floorRight = Math.min(plateauRight, Math.max(0, pref.floorRight ?? 0));
  const deltaLeft = Math.max(0, pref.falloffLeft);
  const deltaRight = Math.max(0, pref.falloffRight);
  return {
    a,
    b,
    plateauLeft,
    plateauRight,
    floorLeft,
    floorRight,
    deltaLeft,
    deltaRight,
    left: a - deltaLeft,
    right: b + deltaRight,
  };
}

function plateauAt(
  t: number,
  a: number,
  b: number,
  plateauLeft: number,
  plateauRight: number,
): number {
  if (b - a < 1e-9) {
    return plateauLeft;
  }
  const u = (t - a) / (b - a);
  return plateauLeft + u * (plateauRight - plateauLeft);
}

/** Piecewise-linear preference curve on t ∈ [0, 1]. */
export function preferenceFactor(t: number, pref: CurvePreference): number {
  const {
    a,
    b,
    plateauLeft,
    plateauRight,
    floorLeft,
    floorRight,
    deltaLeft,
    deltaRight,
    left,
    right,
  } = curveParams(pref);

  if (t >= a && t <= b) {
    return plateauAt(t, a, b, plateauLeft, plateauRight);
  }

  if (t < a) {
    if (deltaLeft <= 0) {
      return floorLeft;
    }
    if (t <= left) {
      return floorLeft;
    }
    return floorLeft + ((t - left) / deltaLeft) * (plateauLeft - floorLeft);
  }

  if (deltaRight <= 0) {
    return floorRight;
  }
  if (t >= right) {
    return floorRight;
  }
  return plateauRight + ((right - t) / deltaRight) * (floorRight - plateauRight);
}

export function factorScoreFromRaw(
  raw: number,
  bounds: NormalizationBounds,
  pref: LayerPreference,
): number {
  const t = normalizeToPreferenceScale(raw, bounds);
  return 100 * preferenceFactor(t, pref);
}

export function factorScoreFromT(t: number, pref: CurvePreference): number {
  return 100 * preferenceFactor(t, pref);
}

export function metaToNormalizationBounds(
  meta: SettlementLayerMeta,
  higherIsBetter: boolean,
): NormalizationBounds {
  return {
    p5: meta.p5,
    p95: meta.p95,
    higherIsBetter,
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
    return metaToNormalizationBounds(meta, higherIsBetter);
  }
  return climToNormalizationBounds(clim, higherIsBetter);
}

/** Raw value clamped to [p5, p95] and mapped to 0–100 (before preference curve). */
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

/** Clamp and order curve parameters after UI edits. */
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
    Math.max(rangeMinClamped, 0.35),
  );
  const falloffRight = Math.min(
    Math.max(0.01, pref.falloffRight ?? legacyFalloff ?? 0.1),
    Math.max(1 - rangeMaxClamped, 0.35),
  );

  const legacyPlateau = Math.min(1, Math.max(0.05, pref.plateauFactor ?? 1));
  const plateauLeftFactor = Math.min(1, Math.max(0.05, pref.plateauLeftFactor ?? legacyPlateau));
  const plateauRightFactor = Math.min(1, Math.max(0.05, pref.plateauRightFactor ?? legacyPlateau));
  const floorLeft = Math.min(plateauLeftFactor, Math.max(0, pref.floorLeft ?? 0));
  const floorRight = Math.min(plateauRightFactor, Math.max(0, pref.floorRight ?? 0));

  return {
    enabled: pref.enabled,
    importance: Math.max(0, pref.importance),
    rangeMin: rangeMinClamped,
    rangeMax: rangeMaxClamped,
    falloffLeft,
    falloffRight,
    floorLeft,
    floorRight,
    plateauFactor: Math.max(plateauLeftFactor, plateauRightFactor),
    plateauLeftFactor,
    plateauRightFactor,
  };
}

export function preferenceFromHandles(handles: PreferenceHandles): LayerPreference {
  const a = Math.min(handles.plateauLeft, handles.plateauRight);
  const b = Math.max(handles.plateauLeft, handles.plateauRight);
  return clampLayerPreference({
    enabled: true,
    importance: 100,
    rangeMin: a,
    rangeMax: b,
    falloffLeft: Math.max(0.01, a - handles.leftZero),
    falloffRight: Math.max(0.01, handles.rightZero - b),
    floorLeft: handles.floorLeft,
    floorRight: handles.floorRight,
    plateauLeftFactor: handles.plateauLeftFactor,
    plateauRightFactor: handles.plateauRightFactor,
  });
}

export function handlesFromPreference(pref: LayerPreference | CurvePreference): PreferenceHandles {
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
          floorLeft: pref.floorLeft,
          floorRight: pref.floorRight,
          plateauLeftFactor: pref.plateauLeftFactor,
          plateauRightFactor: pref.plateauRightFactor,
          plateauFactor: pref.plateauFactor,
        },
  );
  return {
    plateauLeft: p.rangeMin,
    plateauRight: p.rangeMax,
    plateauLeftFactor: p.plateauLeftFactor ?? p.plateauFactor ?? 1,
    plateauRightFactor: p.plateauRightFactor ?? p.plateauFactor ?? 1,
    leftZero: Math.max(0, p.rangeMin - p.falloffLeft),
    rightZero: Math.min(1, p.rangeMax + p.falloffRight),
    floorLeft: p.floorLeft ?? 0,
    floorRight: p.floorRight ?? 0,
  };
}

/** Importance stars 1–5 ↔ internal weight. */
export const IMPORTANCE_STAR_WEIGHTS = [0, 20, 60, 100, 140, 180] as const;

export function importanceFromStars(stars: number): number {
  const clamped = Math.min(5, Math.max(0, Math.round(stars)));
  return IMPORTANCE_STAR_WEIGHTS[clamped];
}

export function starsFromImportance(importance: number): number {
  if (importance <= 0) {
    return 0;
  }
  let best = 1;
  let bestDist = Math.abs(importance - IMPORTANCE_STAR_WEIGHTS[1]);
  for (let stars = 2; stars <= 5; stars += 1) {
    const dist = Math.abs(importance - IMPORTANCE_STAR_WEIGHTS[stars]);
    if (dist < bestDist) {
      bestDist = dist;
      best = stars;
    }
  }
  return best;
}

export function setDealbreakerFloors(pref: LayerPreference, dealbreaker: boolean): LayerPreference {
  if (!dealbreaker) {
    return clampLayerPreference({
      ...pref,
      floorLeft: Math.max(pref.floorLeft ?? 0, 0.15),
      floorRight: Math.max(pref.floorRight ?? 0, 0.15),
    });
  }
  return clampLayerPreference({
    ...pref,
    floorLeft: 0,
    floorRight: 0,
  });
}

export function isDealbreakerPreference(pref: LayerPreference): boolean {
  return (pref.floorLeft ?? 0) < 0.05 && (pref.floorRight ?? 0) < 0.05;
}
