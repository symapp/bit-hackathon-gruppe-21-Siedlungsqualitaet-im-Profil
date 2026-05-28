import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import type { GeocodingResult } from '../models/geocoding.model';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_QUERY_LENGTH = 3;
const RESULT_LIMIT = 6;

@Injectable({
  providedIn: 'root',
})
export class GeocodingService {
  private readonly translate = inject(TranslateService);

  readonly minQueryLength = MIN_QUERY_LENGTH;

  async searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodingResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return [];
    }

    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', trimmed);
    url.searchParams.set('limit', String(RESULT_LIMIT));
    url.searchParams.set('countrycodes', 'ch');

    const response = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': this.translate.currentLang ?? 'de',
      },
    });

    if (!response.ok) {
      const msg = this.translate.instant('search.failed', { status: response.status });
      throw new Error(msg);
    }

    const payload = (await response.json()) as NominatimResult[];

    return payload
      .map((item) => {
        const lat = Number.parseFloat(item.lat);
        const lng = Number.parseFloat(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }
        return {
          placeId: item.place_id,
          label: item.display_name,
          lat,
          lng,
        } satisfies GeocodingResult;
      })
      .filter((item): item is GeocodingResult => item !== null);
  }
}
