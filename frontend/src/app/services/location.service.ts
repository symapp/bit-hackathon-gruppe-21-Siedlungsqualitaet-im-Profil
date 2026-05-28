import { Injectable, effect, inject, signal, computed } from '@angular/core';
import { MetricsService } from './metrics.service';
import { ZarrMapService } from './zarr-map.service';
import { LocationData } from '../models/metrics.model';

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  private readonly metricsService = inject(MetricsService);
  private readonly zarrMap = inject(ZarrMapService);

  private readonly _lat = signal<number>(47.3769); // Default: Zürich
  private readonly _lng = signal<number>(8.5417);
  private readonly _radius = signal<number>(500); // Default: 500m
  private readonly _address = signal<string>('');

  readonly lat = this._lat.asReadonly();
  readonly lng = this._lng.asReadonly();
  readonly radius = this._radius.asReadonly();
  readonly address = this._address.asReadonly();

  readonly metrics = this.zarrMap.metrics;
  readonly metricsLoading = this.zarrMap.metricsLoading;
  readonly metricsError = this.zarrMap.metricsError;
  readonly zarrLayers = this.zarrMap.layerStates;

  readonly locationData = computed<LocationData>(() => ({
    lat: this._lat(),
    lng: this._lng(),
    radius: this._radius(),
    address: this._address(),
    metrics: this.metrics(),
  }));

  constructor() {
    effect(() => {
      const lat = this._lat();
      const lng = this._lng();
      this.metricsService.refreshMetrics(lat, lng);
    });
  }

  setLocation(lat: number, lng: number): void {
    this._lat.set(lat);
    this._lng.set(lng);
  }

  setRadius(radius: number): void {
    this._radius.set(radius);
  }

  setAddress(address: string): void {
    this._address.set(address);
  }

  updateLocation(lat: number, lng: number, address?: string): void {
    this._lat.set(lat);
    this._lng.set(lng);
    if (address) {
      this._address.set(address);
    }
  }

  setActiveZarrLayer(layerId: string): void {
    this.zarrMap.setActiveLayer(layerId);
  }
}
