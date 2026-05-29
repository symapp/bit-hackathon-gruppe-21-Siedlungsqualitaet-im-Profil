import { describe, expect, it } from 'vitest';
import { ZARR_LAYER_DEFINITIONS } from './zarr-layers.config';
import {
  createGoodPlaceLayerPreference,
  getSensibleShape,
} from './good-place-defaults.config';
import {
  handlesFromPreference,
  preferenceFactor,
} from '../utils/preference-scoring.util';

describe('good-place defaults', () => {
  for (const def of ZARR_LAYER_DEFINITIONS) {
    it(`${def.id} keeps handles within safe bounds`, () => {
      const pref = createGoodPlaceLayerPreference(def.id);
      const handles = handlesFromPreference(pref);
      expect(handles.leftZero).toBeGreaterThanOrEqual(0.019);
      expect(handles.rightZero).toBeLessThanOrEqual(0.98);
    });
  }

  it('soft-floor layers score above zero at t=1 for typical tails', () => {
    const pref = createGoodPlaceLayerPreference('tranquillity');
    expect(preferenceFactor(1, pref)).toBeGreaterThan(0);
    expect(preferenceFactor(0, pref)).toBeGreaterThan(0);
  });

  it('balanced traffic layers keep soft floor at high t', () => {
    const pref = createGoodPlaceLayerPreference('road-traffic');
    expect(preferenceFactor(1, pref)).toBeGreaterThan(0.1);
  });

  it('authoring shapes respect rightZero cap', () => {
    for (const def of ZARR_LAYER_DEFINITIONS) {
      const shape = getSensibleShape(def.id);
      expect(shape.rightZero).toBeLessThanOrEqual(0.98);
      expect(shape.leftZero).toBeGreaterThanOrEqual(0.02);
    }
  });
});
