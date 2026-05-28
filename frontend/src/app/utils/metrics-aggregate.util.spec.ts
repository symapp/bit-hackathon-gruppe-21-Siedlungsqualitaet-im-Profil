import { describe, expect, it } from 'vitest';
import {
  SWISS_GRID_LV95_BOUNDS,
  type ZarrLayerDefinition,
} from '../config/zarr-layers.config';
import { createGoodPlaceLayerPreference } from '../config/good-place-defaults.config';
import type { LocationMetrics } from '../models/metrics.model';
import { computePreferenceOverview } from './metrics-aggregate.util';

describe('computePreferenceOverview', () => {
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

  it('returns weighted mean of trapezoid scores', () => {
    const metrics = {
      tranquillityIndex: 100,
      populationDensityPerKm2: 0,
    } as LocationMetrics;

    const prefA = createGoodPlaceLayerPreference('a');
    const prefB = {
      ...createGoodPlaceLayerPreference('b'),
      rangeMin: 0,
      rangeMax: 1,
      falloffLeft: 0.01,
      falloffRight: 0.01,
    };

    const score = computePreferenceOverview(metrics, {
      definitions,
      preferences: { a: prefA, b: prefB },
      metaByLayerId: {
        a: { variable: 'a', p5: 0, p95: 100, higherIsBetter: true, unit: '' },
        b: { variable: 'b', p5: 0, p95: 100, higherIsBetter: true, unit: '' },
      },
    });

    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(0);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it('skips disabled layers', () => {
    const metrics = {
      tranquillityIndex: 100,
      populationDensityPerKm2: 0,
    } as LocationMetrics;

    const prefA = {
      ...createGoodPlaceLayerPreference('a'),
      enabled: true,
      importance: 100,
      rangeMin: 0,
      rangeMax: 1,
      falloffLeft: 0.01,
      falloffRight: 0.01,
    };
    const prefB = { ...createGoodPlaceLayerPreference('b'), enabled: false, importance: 100 };

    const score = computePreferenceOverview(metrics, {
      definitions,
      preferences: { a: prefA, b: prefB },
      metaByLayerId: {
        a: { variable: 'a', p5: 0, p95: 100, higherIsBetter: true, unit: '' },
      },
    });

    expect(score).toBe(100);
  });
});
