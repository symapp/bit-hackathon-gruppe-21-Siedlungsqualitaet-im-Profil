import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import type { GeocodingResult, ReverseGeocodingResult } from '../models/geocoding.model';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface NominatimReverseResult {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    hamlet?: string;
    suburb?: string;
    county?: string;
    state?: string;
    canton?: string;
  };
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
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
        'Accept-Language': this.translate.currentLang ?? 'en',
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

  async reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<ReverseGeocodingResult | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    const url = new URL(NOMINATIM_REVERSE_URL);
    url.searchParams.set('format', 'json');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '14');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'ch');

    const response = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': this.translate.currentLang ?? 'en',
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as NominatimReverseResult;
    const label = payload.display_name?.trim() ?? '';
    const locality = extractLocality(payload);

    if (!label && !locality) {
      return null;
    }

    return {
      label,
      locality,
    };
  }
}

function extractLocality(payload: NominatimReverseResult): string | null {
  const address = payload.address;
  if (!address) {
    return null;
  }

  const candidates = [
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.hamlet,
    address.suburb,
    address.county,
    address.canton,
    address.state,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}
