import { Injectable, computed, inject } from '@angular/core';
import { FEATURED_PLACES, type FeaturedPlace } from '../config/featured-places.config';
import { ZARR_LAYER_DEFINITIONS } from '../config/zarr-layers.config';
import type { LayerPreference } from '../models/layer-preference.model';
import type { SettlementLayerMeta } from '../models/settlement-layer-meta.model';
import { LocationService } from './location.service';
import { ZarrMapService } from './zarr-map.service';
import {
  inferPreferencesFromTinderRatings,
  type TinderPlaceSample,
  type TinderRating,
} from '../utils/tinder-inference.util';

@Injectable({
  providedIn: 'root',
})
export class TinderPreferencesService {
  private readonly locationService = inject(LocationService);
  private readonly zarrMap = inject(ZarrMapService);

  readonly featuredPlaces = FEATURED_PLACES;
  readonly layerMetaById = computed<Record<string, SettlementLayerMeta | null>>(() =>
    Object.fromEntries(this.locationService.zarrLayers().map((layer) => [layer.id, layer.meta] as const)),
  );

  async waitUntilLayersReady(timeoutMs = 120_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const layers = this.locationService.zarrLayers();
      if (
        layers.length === ZARR_LAYER_DEFINITIONS.length &&
        layers.every((layer) => layer.ready && !layer.loading)
      ) {
        return;
      }
      await sleep(250);
    }
    throw new Error('Timed out waiting for Zarr layers to initialize');
  }

  async sampleFeaturedPlaces(
    places: readonly FeaturedPlace[] = this.featuredPlaces,
  ): Promise<Record<string, Record<string, number | null>>> {
    const sampledByPlaceId: Record<string, Record<string, number | null>> = {};
    for (const place of places) {
      const valuesByLayerId = Object.fromEntries(
        await Promise.all(
          ZARR_LAYER_DEFINITIONS.map(async (layer) => [
            layer.id,
            await this.sampleLayerRadiusAverage(place.lng, place.lat, layer.id, 500),
          ]),
        ),
      );
      sampledByPlaceId[place.id] = valuesByLayerId;
    }
    return sampledByPlaceId;
  }

  inferPreferences(
    ratingsByPlaceId: Readonly<Record<string, TinderRating>>,
    sampledByPlaceId: Readonly<Record<string, Record<string, number | null>>>,
  ): Record<string, LayerPreference> {
    const layerInputs = ZARR_LAYER_DEFINITIONS.map((layer) => ({
      layerId: layer.id,
      clim: layer.clim,
      higherIsBetter: layer.higherIsBetter,
      meta: this.layerMetaById()[layer.id] ?? null,
    }));

    const samples: TinderPlaceSample[] = this.featuredPlaces
      .map((place) => ({
        placeId: place.id,
        rating: ratingsByPlaceId[place.id] ?? 0,
        valuesByLayerId: sampledByPlaceId[place.id] ?? {},
      }));

    return inferPreferencesFromTinderRatings(layerInputs, samples);
  }

  applyPreferences(preferences: Readonly<Record<string, LayerPreference>>): void {
    for (const [layerId, preference] of Object.entries(preferences)) {
      this.locationService.setZarrLayerPreference(layerId, preference);
    }
  }

  private async sampleLayerRadiusAverage(
    lng: number,
    lat: number,
    layerId: string,
    radiusMeters: number,
  ): Promise<number | null> {
    const offsets = samplingOffsetsMeters(radiusMeters);
    const values = await Promise.all(
      offsets.map(({ dx, dy }) => {
        const sampleLng = lng + metersToLngDelta(dx, lat);
        const sampleLat = lat + metersToLatDelta(dy);
        return this.zarrMap.sampleLayerAt(sampleLng, sampleLat, layerId);
      }),
    );
    const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
    if (valid.length === 0) {
      return null;
    }
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function samplingOffsetsMeters(radiusMeters: number): { dx: number; dy: number }[] {
  const offsets: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }];
  const rings = [
    { radius: radiusMeters * 0.5, count: 8 },
    { radius: radiusMeters, count: 16 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * Math.PI * 2;
      offsets.push({
        dx: ring.radius * Math.cos(angle),
        dy: ring.radius * Math.sin(angle),
      });
    }
  }
  return offsets;
}

function metersToLatDelta(meters: number): number {
  return meters / 111_320;
}

function metersToLngDelta(meters: number, atLat: number): number {
  const cosLat = Math.cos((atLat * Math.PI) / 180);
  if (Math.abs(cosLat) < 1e-6) {
    return 0;
  }
  return meters / (111_320 * cosLat);
}
