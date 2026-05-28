import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { clampToSwitzerland } from '../config/map-bounds.config';
import { ZarrMapService } from './zarr-map.service';

export interface RegionOfInterest {
  id: string;
  name: string;
  color: string;
  radius: number;
  lat: number;
  lng: number;
}

const DEFAULT_REGION_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'];

function createDefaultRegion(): RegionOfInterest {
  return {
    id: crypto.randomUUID(),
    name: 'Region 1',
    color: DEFAULT_REGION_COLORS[0],
    radius: 500,
    lat: 47.3769,
    lng: 8.5417,
  };
}

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  private readonly zarrMap = inject(ZarrMapService);

  private readonly _regions = signal<RegionOfInterest[]>([createDefaultRegion()]);
  private readonly _activeRegionId = signal(this._regions()[0]?.id ?? '');
  private readonly _viewCenter = signal({ lat: 47.3769, lng: 8.5417 });
  private readonly _address = signal('');

  readonly regions = this._regions.asReadonly();
  readonly activeRegionId = this._activeRegionId.asReadonly();
  readonly activeRegion = computed(
    () => this._regions().find((region) => region.id === this._activeRegionId()) ?? null,
  );
  readonly lat = computed(() => this.activeRegion()?.lat ?? 47.3769);
  readonly lng = computed(() => this.activeRegion()?.lng ?? 8.5417);
  readonly address = this._address.asReadonly();

  readonly metrics = this.zarrMap.metrics;
  readonly metricsLoading = this.zarrMap.metricsLoading;
  readonly metricsError = this.zarrMap.metricsError;
  readonly overviewScore = this.zarrMap.overviewScore;
  readonly zarrLayers = this.zarrMap.layerStates;

  constructor() {
    effect(() => {
      const lat = this.lat();
      const lng = this.lng();
      void this.zarrMap.sampleLocation(lng, lat);
    });
  }

  setLocation(lat: number, lng: number, address?: string): void {
    const clamped = clampToSwitzerland(lng, lat);
    const activeRegionId = this._activeRegionId();

    this._regions.update((regions) =>
      regions.map((region) =>
        region.id === activeRegionId ? { ...region, lat: clamped.lat, lng: clamped.lng } : region,
      ),
    );

    if (address !== undefined) {
      this._address.set(address);
    }
  }

  addRegion(): void {
    const nextIndex = this._regions().length + 1;
    const viewCenter = this._viewCenter();
    const clamped = clampToSwitzerland(viewCenter.lng, viewCenter.lat);
    const region: RegionOfInterest = {
      id: crypto.randomUUID(),
      name: `Region ${nextIndex}`,
      color: DEFAULT_REGION_COLORS[(nextIndex - 1) % DEFAULT_REGION_COLORS.length],
      radius: 500,
      lat: clamped.lat,
      lng: clamped.lng,
    };

    this._regions.update((regions) => [...regions, region]);
    this._activeRegionId.set(region.id);
    this._address.set('');
  }

  setViewCenter(lat: number, lng: number): void {
    const clamped = clampToSwitzerland(lng, lat);
    this._viewCenter.set({ lat: clamped.lat, lng: clamped.lng });
  }

  updateRegion(
    regionId: string,
    patch: Partial<Pick<RegionOfInterest, 'name' | 'color' | 'radius'>>,
  ): void {
    this._regions.update((regions) =>
      regions.map((region) => {
        if (region.id !== regionId) {
          return region;
        }

        const radius =
          patch.radius === undefined
            ? region.radius
            : Math.min(3000, Math.max(100, Math.round(patch.radius)));

        return {
          ...region,
          name: patch.name ?? region.name,
          color: patch.color ?? region.color,
          radius,
        };
      }),
    );
  }

  removeRegion(regionId: string): void {
    const currentRegions = this._regions();
    const remaining = currentRegions.filter((region) => region.id !== regionId);

    if (remaining.length === 0) {
      this._regions.set([]);
      this._activeRegionId.set('');
      this._address.set('');
      return;
    }

    this._regions.set(remaining);
    if (this._activeRegionId() === regionId) {
      this._activeRegionId.set(remaining[0].id);
      this._address.set('');
    }
  }

  setActiveRegion(regionId: string): void {
    if (!this._regions().some((region) => region.id === regionId)) {
      return;
    }
    this._activeRegionId.set(regionId);
    this._address.set('');
  }

  setZarrLayerWeight(layerId: string, weight: number): void {
    this.zarrMap.setLayerWeight(layerId, weight);
  }

  setZarrLayerEnabled(layerId: string, enabled: boolean): void {
    this.zarrMap.setLayerEnabled(layerId, enabled);
  }

  setAllZarrLayersEnabled(enabled: boolean): void {
    for (const layer of this.zarrLayers()) {
      this.zarrMap.setLayerEnabled(layer.id, enabled);
    }
  }
}
