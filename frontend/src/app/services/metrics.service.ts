import { Injectable, inject } from '@angular/core';
import { ZarrMapService } from './zarr-map.service';

/**
 * Triggers GeoZarr point sampling for the current map location.
 */
@Injectable({
  providedIn: 'root',
})
export class MetricsService {
  private readonly zarrMap = inject(ZarrMapService);

  refreshMetrics(lat: number, lng: number): void {
    void this.zarrMap.sampleLocation(lng, lat);
  }
}
