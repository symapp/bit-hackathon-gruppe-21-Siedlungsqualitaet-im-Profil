import type { ZarrLayerDefinition } from '../config/zarr-layers.config';
import type { LocationMetrics } from '../models/metrics.model';

/** Map raw metric to 0–1 using layer color scale; clamped to clim range. */
export function normalizeMetric(
  value: number,
  clim: [number, number],
  higherIsBetter: boolean,
): number {
  const [min, max] = clim;
  if (max <= min) {
    return 0;
  }
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return higherIsBetter ? t : 1 - t;
}

/**
 * Weighted mean of normalized layer scores (0–1 each), returned as 0–100 overview score.
 * Layers with weight ≤ 0 or null metrics are skipped.
 */
export function computeWeightedOverview(
  metrics: LocationMetrics,
  definitions: readonly ZarrLayerDefinition[],
  weights: Readonly<Record<string, number>>,
  enabled: Readonly<Record<string, boolean>>,
): number | null {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const def of definitions) {
    if (enabled[def.id] === false) {
      continue;
    }

    const w = weights[def.id] ?? 0;
    if (w <= 0) {
      continue;
    }

    const raw = metrics[def.metricKey];
    if (raw === null) {
      continue;
    }

    const normalized = normalizeMetric(raw, def.clim, def.higherIsBetter);
    weightedSum += normalized * w;
    weightTotal += w;
  }

  if (weightTotal === 0) {
    return null;
  }

  return (weightedSum / weightTotal) * 100;
}
