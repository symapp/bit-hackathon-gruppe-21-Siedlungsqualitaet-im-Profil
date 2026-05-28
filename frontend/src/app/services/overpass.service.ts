import { Injectable } from '@angular/core';

export interface GroceryStore {
  id: string;
  osmType: string;
  name: string;
  shop: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  address: string;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
  };
  tags?: Record<string, string>;
}

/**
 * Simple service that queries the Overpass API for grocery stores within a radius.
 * It returns matching OSM elements. Errors are propagated to the caller
 * which can handle them (e.g., by logging a console warning).
 */
@Injectable({
  providedIn: 'root',
})
export class OverpassService {
  private readonly requestTimeoutMs = 8000;
  private readonly endpoints = [
    'https://overpass.osm.ch/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  /**
   * Fetches grocery stores within the given radius.
   *
   * @param lat Latitude of the centre point (WGS84).
   * @param lng Longitude of the centre point (WGS84).
   * @param radiusMeters Search radius in metres.
   * @returns Promise that resolves to matching OSM elements with display coordinates.
   */
  async getGroceryStores(
    lat: number,
    lng: number,
    radiusMeters: number,
    signal?: AbortSignal,
  ): Promise<GroceryStore[]> {
    const query = `
      [out:json][timeout:25];
      (
        node["shop"~"^(supermarket|grocery|convenience|greengrocer)$"](around:${radiusMeters},${lat},${lng});
        way["shop"~"^(supermarket|grocery|convenience|greengrocer)$"](around:${radiusMeters},${lat},${lng});
        relation["shop"~"^(supermarket|grocery|convenience|greengrocer)$"](around:${radiusMeters},${lat},${lng});
      );
      out body center;
    `;
    let lastError: unknown;

    for (const endpoint of this.endpoints) {
      try {
        return await this.fetchStores(endpoint, query, lat, lng, signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError ?? new Error('Overpass request failed');
  }

  async getGroceryStoreCount(
    lat: number,
    lng: number,
    radiusMeters: number,
    signal?: AbortSignal,
  ): Promise<number> {
    return (await this.getGroceryStores(lat, lng, radiusMeters, signal)).length;
  }

  private async fetchStores(
    endpoint: string,
    query: string,
    lat: number,
    lng: number,
    signal?: AbortSignal,
  ): Promise<GroceryStore[]> {
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.requestTimeoutMs);
    const abortRequest = () => controller.abort();
    signal?.addEventListener('abort', abortRequest, { once: true });

    try {
      return await this.fetchStoresWithSignal(endpoint, query, lat, lng, controller.signal);
    } catch (error) {
      if (timedOut) {
        throw new Error(`Overpass request timed out for ${endpoint}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortRequest);
    }
  }

  private async fetchStoresWithSignal(
    endpoint: string,
    query: string,
    lat: number,
    lng: number,
    signal: AbortSignal,
  ): Promise<GroceryStore[]> {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Overpass request failed with status ${response.status}`);
    }
    const data = await response.json();
    const elements = Array.isArray(data.elements) ? (data.elements as OverpassElement[]) : [];

    return elements
      .map((element) => this.toGroceryStore(element, lat, lng))
      .filter((store): store is GroceryStore => store !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  private toGroceryStore(
    element: OverpassElement,
    originLat: number,
    originLng: number,
  ): GroceryStore | null {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;

    if (lat === undefined || lng === undefined) {
      return null;
    }

    const tags = element.tags ?? {};
    const street = tags['addr:street'];
    const houseNumber = tags['addr:housenumber'];
    const city = tags['addr:city'];
    const address = [street && houseNumber ? `${street} ${houseNumber}` : street, city]
      .filter(Boolean)
      .join(', ');

    return {
      id: `${element.type}/${element.id}`,
      osmType: element.type,
      name: tags['name'] || this.labelForShop(tags['shop']),
      shop: tags['shop'] ?? 'grocery',
      lat,
      lng,
      distanceMeters: this.distanceMeters(originLat, originLng, lat, lng),
      address,
    };
  }

  private labelForShop(shop?: string): string {
    switch (shop) {
      case 'supermarket':
        return 'Supermarket';
      case 'convenience':
        return 'Convenience store';
      case 'greengrocer':
        return 'Greengrocer';
      default:
        return 'Grocery store';
    }
  }

  private distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const earthRadiusMeters = 6371000;
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
