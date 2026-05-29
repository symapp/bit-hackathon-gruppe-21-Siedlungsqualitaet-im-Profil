import { describe, expect, it } from 'vitest';
import { inferPreferencesFromTinderRatings, type TinderPlaceSample } from './tinder-inference.util';

describe('inferPreferencesFromTinderRatings', () => {
  const layers = [
    {
      layerId: 'layer-a',
      clim: [0, 100] as [number, number],
      higherIsBetter: true,
      meta: null,
    },
  ];

  it('infers higher preferred range for positively correlated factor', () => {
    const samples: TinderPlaceSample[] = [
      { placeId: 'p1', rating: -2, valuesByLayerId: { 'layer-a': 5 } },
      { placeId: 'p2', rating: -1, valuesByLayerId: { 'layer-a': 20 } },
      { placeId: 'p3', rating: 0, valuesByLayerId: { 'layer-a': 40 } },
      { placeId: 'p4', rating: 1, valuesByLayerId: { 'layer-a': 75 } },
      { placeId: 'p5', rating: 2, valuesByLayerId: { 'layer-a': 92 } },
    ];

    const result = inferPreferencesFromTinderRatings(layers, samples);
    const pref = result['layer-a'];
    expect(pref.importance).toBeGreaterThan(80);
    expect(pref.rangeMin).toBeGreaterThan(0.45);
    expect(pref.rangeMax).toBeGreaterThan(pref.rangeMin);
  });

  it('infers lower preferred range for negative correlation', () => {
    const samples: TinderPlaceSample[] = [
      { placeId: 'p1', rating: 2, valuesByLayerId: { 'layer-a': 4 } },
      { placeId: 'p2', rating: 1, valuesByLayerId: { 'layer-a': 18 } },
      { placeId: 'p3', rating: 0, valuesByLayerId: { 'layer-a': 48 } },
      { placeId: 'p4', rating: -1, valuesByLayerId: { 'layer-a': 70 } },
      { placeId: 'p5', rating: -2, valuesByLayerId: { 'layer-a': 95 } },
    ];

    const result = inferPreferencesFromTinderRatings(layers, samples);
    const pref = result['layer-a'];
    expect(pref.importance).toBeGreaterThan(80);
    expect(pref.rangeMax).toBeLessThan(0.55);
  });
});
