import { describe, expect, it } from 'vitest';
import {
  SWISS_GRID_LV95_BOUNDS,
  type ZarrLayerDefinition,
} from '../config/zarr-layers.config';
import type { LocationMetrics } from '../models/metrics.model';
import { computeWeightedOverview, normalizeMetric } from './metrics-aggregate.util';

describe('normalizeMetric', () => {
  it('maps value into 0–1 using clim', () => {
    expect(normalizeMetric(50, [0, 100], true)).toBe(0.5);
    expect(normalizeMetric(50, [0, 100], false)).toBe(0.5);
  });

  it('inverts when lower is better', () => {
    expect(normalizeMetric(0, [0, 100], false)).toBe(1);
    expect(normalizeMetric(100, [0, 100], false)).toBe(0);
  });
});

describe('computeWeightedOverview', () => {
  const definitions: ZarrLayerDefinition[] = [
    {
      id: 'a',
      label: 'A',
      description: '',
      storePath: '',
      variable: 'a',
      bounds: SWISS_GRID_LV95_BOUNDS,
      latIsAscending: false,
      colormap: [],
      clim: [0, 100],
      metricKey: 'tranquillityIndex',
      metricLabel: 'A',
      metricUnit: '',
      formatValue: (v) => String(v),
      higherIsBetter: true,
    },
    {
      id: 'b',
      label: 'B',
      description: '',
      storePath: '',
      variable: 'b',
      bounds: SWISS_GRID_LV95_BOUNDS,
      latIsAscending: false,
      colormap: [],
      clim: [0, 100],
      metricKey: 'populationDensityPerKm2',
      metricLabel: 'B',
      metricUnit: '',
      formatValue: (v) => String(v),
      higherIsBetter: true,
    },
  ];

  it('returns weighted mean as 0–100 score', () => {
    const metrics = {
      tranquillityIndex: 100,
      populationDensityPerKm2: 0,
    } as LocationMetrics;

    const score = computeWeightedOverview(
      metrics,
      definitions,
      { a: 100, b: 100 },
      { a: true, b: true },
    );

    expect(score).toBe(50);
  });

  it('skips disabled layers and zero weights', () => {
    const metrics = {
      tranquillityIndex: 100,
      populationDensityPerKm2: 0,
    } as LocationMetrics;

    expect(
      computeWeightedOverview(metrics, definitions, { a: 100, b: 0 }, { a: true, b: true }),
    ).toBe(100);
    expect(
      computeWeightedOverview(metrics, definitions, { a: 100, b: 100 }, { a: true, b: false }),
    ).toBe(100);
  });
});
