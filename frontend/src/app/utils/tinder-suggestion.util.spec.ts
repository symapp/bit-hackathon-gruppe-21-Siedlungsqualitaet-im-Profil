import { describe, expect, it } from 'vitest';
import type { FeaturedPlace } from '../config/featured-places.config';
import { createGoodPlaceLayerPreference } from '../config/good-place-defaults.config';
import { pickBestFeaturedPlace } from './tinder-suggestion.util';

const PLACES: FeaturedPlace[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    canton: 'ZH',
    lat: 47.37,
    lng: 8.54,
    imagePath: '/featured-places/zurich.jpg',
    description: 'Urban',
  },
  {
    id: 'beta',
    name: 'Beta',
    canton: 'BE',
    lat: 46.75,
    lng: 7.62,
    imagePath: '/featured-places/thun.jpg',
    description: 'Small city',
  },
];

describe('pickBestFeaturedPlace', () => {
  it('prefers a positively rated place over a higher-scoring negative one', () => {
    const preferences = {
      tranquillity: createGoodPlaceLayerPreference('tranquillity'),
    };
    const sampledByPlaceId = {
      alpha: { tranquillity: 0.9 },
      beta: { tranquillity: 0.1 },
    };

    const suggestion = pickBestFeaturedPlace(
      PLACES,
      preferences,
      sampledByPlaceId,
      {},
      { alpha: 2, beta: -2 },
    );

    expect(suggestion?.place.id).toBe('alpha');
  });

  it('picks the highest preference score among neutral ratings', () => {
    const preferences = {
      tranquillity: createGoodPlaceLayerPreference('tranquillity'),
    };
    const sampledByPlaceId = {
      alpha: { tranquillity: 0.2 },
      beta: { tranquillity: 0.8 },
    };

    const suggestion = pickBestFeaturedPlace(
      PLACES,
      preferences,
      sampledByPlaceId,
      {},
      { alpha: 0, beta: 0 },
    );

    expect(suggestion?.place.id).toBe('beta');
  });
});
