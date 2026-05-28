import { describe, expect, it } from 'vitest';
import {
  computePreferenceOverviewScore,
  factorScoreFromRaw,
  handlesFromPreference,
  normalizeToPreferenceScale,
  preferenceFactor,
  preferenceFromHandles,
  preferenceScaleToRaw,
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
  const symmetric = { rangeMin: 0.4, rangeMax: 0.6, falloffLeft: 0.1, falloffRight: 0.1 };

  it('returns 1 inside plateau', () => {
    expect(preferenceFactor(0.5, symmetric)).toBe(1);
    expect(preferenceFactor(0.4, symmetric)).toBe(1);
    expect(preferenceFactor(0.6, symmetric)).toBe(1);
  });

  it('linear falloff outside plateau (symmetric)', () => {
    expect(preferenceFactor(0.65, symmetric)).toBeCloseTo(0.5, 5);
    expect(preferenceFactor(0.7, symmetric)).toBe(0);
    expect(preferenceFactor(0.3, symmetric)).toBe(0);
  });

  it('uses independent left and right falloff widths', () => {
    const asymmetric = {
      rangeMin: 0.4,
      rangeMax: 0.6,
      falloffLeft: 0.2,
      falloffRight: 0.05,
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
    };
    const rawInRange = preferenceScaleToRaw(0.5, bounds);
    expect(factorScoreFromRaw(rawInRange, bounds, pref)).toBe(100);

    const rawAt65 = preferenceScaleToRaw(0.65, bounds);
    expect(factorScoreFromRaw(rawAt65, bounds, pref)).toBeCloseTo(50, 5);
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

describe('handles roundtrip', () => {
  it('preserves trapezoid shape with asymmetric falloff', () => {
    const pref = {
      rangeMin: 0.4,
      rangeMax: 0.6,
      falloffLeft: 0.15,
      falloffRight: 0.08,
    };
    const h = handlesFromPreference(pref);
    const back = preferenceFromHandles(h.plateauLeft, h.plateauRight, h.leftZero, h.rightZero);
    expect(back.rangeMin).toBeCloseTo(0.4, 2);
    expect(back.rangeMax).toBeCloseTo(0.6, 2);
    expect(back.falloffLeft).toBeCloseTo(0.15, 2);
    expect(back.falloffRight).toBeCloseTo(0.08, 2);
  });
});
