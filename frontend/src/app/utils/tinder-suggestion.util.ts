import type { FeaturedPlace } from '../config/featured-places.config';
import { ZARR_LAYER_DEFINITIONS, type ZarrLayerDefinition } from '../config/zarr-layers.config';
import type { LayerPreference } from '../models/layer-preference.model';
import { EMPTY_LOCATION_METRICS, type LocationMetrics } from '../models/metrics.model';
import type { SettlementLayerMeta } from '../models/settlement-layer-meta.model';
import { computePreferenceOverview } from './metrics-aggregate.util';
import type { TinderRating } from './tinder-inference.util';

export interface TinderPlaceSuggestion {
  place: FeaturedPlace;
  score: number;
}

export function metricsFromTinderSamples(
  valuesByLayerId: Readonly<Record<string, number | null>>,
  definitions: readonly ZarrLayerDefinition[] = ZARR_LAYER_DEFINITIONS,
): LocationMetrics {
  const metrics: LocationMetrics = { ...EMPTY_LOCATION_METRICS };
  for (const definition of definitions) {
    const raw = valuesByLayerId[definition.id];
    if (raw !== null && raw !== undefined && Number.isFinite(raw)) {
      metrics[definition.metricKey] = raw;
    }
  }
  return metrics;
}

export function scoreFeaturedPlace(
  place: FeaturedPlace,
  preferences: Readonly<Record<string, LayerPreference>>,
  sampledByPlaceId: Readonly<Record<string, Record<string, number | null>>>,
  metaByLayerId: Readonly<Record<string, SettlementLayerMeta | null>>,
): number | null {
  const metrics = metricsFromTinderSamples(sampledByPlaceId[place.id] ?? {});
  return computePreferenceOverview(metrics, {
    definitions: ZARR_LAYER_DEFINITIONS,
    preferences,
    metaByLayerId,
  });
}

/**
 * Picks the featured place that best matches inferred preferences, preferring
 * places the user rated positively when possible.
 */
export function pickBestFeaturedPlace(
  places: readonly FeaturedPlace[],
  preferences: Readonly<Record<string, LayerPreference>>,
  sampledByPlaceId: Readonly<Record<string, Record<string, number | null>>>,
  metaByLayerId: Readonly<Record<string, SettlementLayerMeta | null>>,
  ratingsByPlaceId: Readonly<Record<string, TinderRating>>,
): TinderPlaceSuggestion | null {
  if (places.length === 0) {
    return null;
  }

  const scored = places
    .map((place) => {
      const score = scoreFeaturedPlace(place, preferences, sampledByPlaceId, metaByLayerId);
      if (score === null) {
        return null;
      }
      return {
        place,
        score,
        rating: ratingsByPlaceId[place.id] ?? 0,
      };
    })
    .filter((item): item is { place: FeaturedPlace; score: number; rating: TinderRating } => item !== null);

  if (scored.length === 0) {
    return null;
  }

  const positive = scored.filter((item) => item.rating >= 1);
  const neutralOrBetter = scored.filter((item) => item.rating >= 0);
  const candidatePool =
    positive.length > 0 ? positive : neutralOrBetter.length > 0 ? neutralOrBetter : scored;

  const best = candidatePool.reduce((current, next) => {
    if (next.score > current.score) {
      return next;
    }
    if (next.score < current.score) {
      return current;
    }
    return next.rating > current.rating ? next : current;
  });

  return { place: best.place, score: best.score };
}
