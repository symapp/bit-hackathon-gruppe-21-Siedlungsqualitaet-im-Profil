import { describe, expect, it } from 'vitest';
import { createGoodPlaceLayerPreference } from '../config/good-place-defaults.config';
import {
  computePreferenceOverviewScore,
  factorScoreFromRaw,
  handlesFromPreference,
  importanceFromStars,
  normalizeToPreferenceScale,
  normalizedRawPercent,
  normalizationBoundsForLayer,
  preferenceFactor,
  preferenceFromHandles,
  preferenceScaleToRaw,
  starsFromImportance,
} from './preference-scoring.util';

describe('normalizeToPreferenceScale', () => {
  it('maps raw into t with higherIsBetter', () => {
    expect(normalizeToPreferenceScale(50, { p5: 0, p95: 100, higherIsBetter: true })).toBe(0.5);
  });

  it('inverts when lower raw is better', () => {
    expect(normalizeToPreferenceScale(15, { p5: 15, p95: 90, higherIsBetter: false })).toBe(1);
    expect(normalizeToPreferenceScale(90, { p5: 15, p95: 90, higherIsBetter: false })).toBe(0);
  });
});

describe('preferenceFactor', () => {
  const symmetric = {
    rangeMin: 0.4,
    rangeMax: 0.6,
    falloffLeft: 0.1,
    falloffRight: 0.1,
    floorLeft: 0,
    floorRight: 0,
    plateauLeftFactor: 1,
    plateauRightFactor: 1,
  };

  it('returns plateau factor inside plateau', () => {
    expect(preferenceFactor(0.5, symmetric)).toBe(1);
    expect(preferenceFactor(0.4, symmetric)).toBe(1);
    expect(preferenceFactor(0.6, symmetric)).toBe(1);
  });

  it('linear falloff outside plateau (symmetric)', () => {
    expect(preferenceFactor(0.65, symmetric)).toBeCloseTo(0.5, 5);
    expect(preferenceFactor(0.7, symmetric)).toBe(0);
    expect(preferenceFactor(0.3, symmetric)).toBe(0);
  });

  it('uses soft floors when configured', () => {
    const soft = {
      rangeMin: 0.4,
      rangeMax: 0.6,
      falloffLeft: 0.1,
      falloffRight: 0.1,
      floorLeft: 0.2,
      floorRight: 0.2,
      plateauLeftFactor: 1,
      plateauRightFactor: 1,
    };
    expect(preferenceFactor(0, soft)).toBe(0.2);
    expect(preferenceFactor(1, soft)).toBe(0.2);
    expect(preferenceFactor(0.35, soft)).toBeCloseTo(0.6, 5);
  });

  it('uses independent left and right falloff widths', () => {
    const asymmetric = {
      rangeMin: 0.4,
      rangeMax: 0.6,
      falloffLeft: 0.2,
      falloffRight: 0.05,
      floorLeft: 0,
      floorRight: 0,
      plateauLeftFactor: 1,
      plateauRightFactor: 1,
    };
    expect(preferenceFactor(0.3, asymmetric)).toBeCloseTo(0.5, 5);
    expect(preferenceFactor(0.625, asymmetric)).toBeCloseTo(0.5, 5);
    expect(preferenceFactor(0.2, asymmetric)).toBe(0);
    expect(preferenceFactor(0.65, asymmetric)).toBe(0);
  });
});

describe('factorScoreFromRaw', () => {
  it('ÖV travel time example: in range = 100, at 0.65 t = 50', () => {
    const bounds = { p5: 20, p95: 80, higherIsBetter: false };
    const pref = {
      rangeMin: 0.4,
      rangeMax: 0.6,
      falloffLeft: 0.1,
      falloffRight: 0.1,
      enabled: true,
      importance: 100,
      floorLeft: 0,
      floorRight: 0,
      plateauFactor: 1,
    };
    const rawInRange = preferenceScaleToRaw(0.5, bounds);
    expect(factorScoreFromRaw(rawInRange, bounds, pref)).toBe(100);

    const rawAt65 = preferenceScaleToRaw(0.65, bounds);
    expect(factorScoreFromRaw(rawAt65, bounds, pref)).toBeCloseTo(50, 5);
  });
});

describe('normalizedRawPercent', () => {
  it('maps raw EW into 0–100 using p5/p95 before trapezoid', () => {
    const bounds = { p5: 50, p95: 3_500, higherIsBetter: true };
    expect(normalizedRawPercent(50, bounds)).toBe(0);
    expect(normalizedRawPercent(1_560, bounds)).toBeCloseTo(43.77, 1);
    expect(normalizedRawPercent(3_500, bounds)).toBe(100);
    expect(normalizedRawPercent(10_000, bounds)).toBe(100);
  });
});

describe('normalizationBoundsForLayer', () => {
  it('prefers settlement meta p5/p95 but keeps layer higherIsBetter', () => {
    const bounds = normalizationBoundsForLayer([0, 1], true, {
      variable: 'x',
      p5: 100,
      p95: 2_000,
      higherIsBetter: false,
      unit: 'EW',
    });
    expect(bounds.p5).toBe(100);
    expect(bounds.p95).toBe(2_000);
    expect(bounds.higherIsBetter).toBe(true);
  });
});

describe('computePreferenceOverviewScore', () => {
  it('weighted mean of factor scores', () => {
    expect(
      computePreferenceOverviewScore([
        { layerId: 'a', score: 100, importance: 100 },
        { layerId: 'b', score: 0, importance: 100 },
      ]),
    ).toBe(50);
  });
});

describe('good-place pt-accessibility default', () => {
  const bounds = { p5: 4, p95: 2_533, higherIsBetter: true };

  it('places the plateau toward high EW (right side of chart)', () => {
    const pref = createGoodPlaceLayerPreference('pt-accessibility');
    expect(pref.rangeMax).toBeGreaterThan(0.9);
    expect(pref.rangeMin).toBeGreaterThan(0.35);
    expect(pref.falloffRight).toBeLessThan(pref.falloffLeft);
  });

  it('scores strong ÖV highly and weak ÖV low', () => {
    const pref = createGoodPlaceLayerPreference('pt-accessibility');
    expect(factorScoreFromRaw(2_400, bounds, pref)).toBe(100);
    expect(factorScoreFromRaw(50, bounds, pref)).toBeLessThan(30);
  });
});

describe('good-place miv-accessibility default', () => {
  const bounds = { p5: 45, p95: 11_657, higherIsBetter: true };

  it('places the plateau toward high EW (right side of chart)', () => {
    const pref = createGoodPlaceLayerPreference('miv-accessibility');
    expect(pref.rangeMax).toBeGreaterThan(0.9);
    expect(pref.rangeMin).toBeGreaterThan(0.35);
    expect(pref.falloffRight).toBeLessThan(pref.falloffLeft);
  });

  it('scores strong MIV highly and weak MIV low', () => {
    const pref = createGoodPlaceLayerPreference('miv-accessibility');
    expect(factorScoreFromRaw(11_000, bounds, pref)).toBe(100);
    expect(factorScoreFromRaw(80, bounds, pref)).toBeLessThan(30);
  });
});

describe('handles roundtrip', () => {
  it('preserves curve shape with asymmetric falloff and floors', () => {
    const pref = {
      rangeMin: 0.4,
      rangeMax: 0.6,
      falloffLeft: 0.15,
      falloffRight: 0.08,
      floorLeft: 0.2,
      floorRight: 0.25,
      plateauLeftFactor: 0.95,
      plateauRightFactor: 0.75,
    };
    const h = handlesFromPreference(pref);
    const back = preferenceFromHandles(h);
    expect(back.rangeMin).toBeCloseTo(0.4, 2);
    expect(back.rangeMax).toBeCloseTo(0.6, 2);
    expect(back.falloffLeft).toBeCloseTo(0.15, 2);
    expect(back.falloffRight).toBeCloseTo(0.08, 2);
    expect(back.floorLeft).toBeCloseTo(0.2, 2);
    expect(back.floorRight).toBeCloseTo(0.25, 2);
    expect(back.plateauLeftFactor).toBeCloseTo(0.95, 2);
    expect(back.plateauRightFactor).toBeCloseTo(0.75, 2);
  });

  it('interpolates asymmetric plateau height', () => {
    const pref = {
      rangeMin: 0.4,
      rangeMax: 0.6,
      falloffLeft: 0.1,
      falloffRight: 0.1,
      plateauLeftFactor: 1,
      plateauRightFactor: 0.6,
    };
    expect(preferenceFactor(0.4, pref)).toBeCloseTo(1, 5);
    expect(preferenceFactor(0.6, pref)).toBeCloseTo(0.6, 5);
    expect(preferenceFactor(0.5, pref)).toBeCloseTo(0.8, 5);
  });
});

describe('importance stars', () => {
  it('maps stars to weights and back', () => {
    expect(importanceFromStars(3)).toBe(100);
    expect(starsFromImportance(100)).toBe(3);
  });
});
