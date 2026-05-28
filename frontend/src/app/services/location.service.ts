import { Injectable, effect, inject, signal } from '@angular/core';
import { ZarrMapService } from './zarr-map.service';

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  private readonly zarrMap = inject(ZarrMapService);

  private readonly _lat = signal(47.3769); // Default: Zürich
  private readonly _lng = signal(8.5417);
  private readonly _radius = signal(500);
  private readonly _address = signal('');

  readonly lat = this._lat.asReadonly();
  readonly lng = this._lng.asReadonly();
  readonly radius = this._radius.asReadonly();
  readonly address = this._address.asReadonly();

  readonly metrics = this.zarrMap.metrics;
  readonly metricsLoading = this.zarrMap.metricsLoading;
  readonly metricsError = this.zarrMap.metricsError;
  readonly overviewScore = this.zarrMap.overviewScore;
  readonly zarrLayers = this.zarrMap.layerStates;

  constructor() {
    effect(() => {
      const lat = this._lat();
      const lng = this._lng();
      void this.zarrMap.sampleLocation(lng, lat);
    });
  }

  setLocation(lat: number, lng: number, address?: string): void {
    this._lat.set(lat);
    this._lng.set(lng);
    if (address !== undefined) {
      this._address.set(address);
    }
  }

  setRadius(radius: number): void {
    this._radius.set(radius);
  }

  setZarrLayerWeight(layerId: string, weight: number): void {
    this.zarrMap.setLayerWeight(layerId, weight);
  }

  setZarrLayerEnabled(layerId: string, enabled: boolean): void {
    this.zarrMap.setLayerEnabled(layerId, enabled);
  }
}
