import { Injectable } from '@angular/core';
import { LocationMetrics } from '../models/metrics.model';

@Injectable({
  providedIn: 'root'
})
export class MetricsService {

  /**
   * Generates mock metrics based on coordinates and radius.
   * In production, this would call a backend API.
   */
  getMetrics(lat: number, lng: number, radius: number): LocationMetrics {
    // Use coordinates and radius as seed for pseudo-random but consistent results
    const seed = Math.abs(Math.sin(lat * 1000 + lng * 500) * 10000);
    const radiusFactor = radius / 500; // normalize radius to a factor

    return {
      restaurants: Math.max(1, Math.round((seed % 15 + 3) * radiusFactor)),
      supermarkets: Math.max(1, Math.round((seed % 5 + 1) * radiusFactor)),
      publicTransport: Math.max(1, Math.round((seed % 10 + 2) * radiusFactor)),
      parks: Math.max(1, Math.round((seed % 4 + 1) * radiusFactor)),
      schools: Math.max(0, Math.round((seed % 3) * radiusFactor)),
      pharmacies: Math.max(1, Math.round((seed % 4 + 1) * radiusFactor)),
    };
  }
}
