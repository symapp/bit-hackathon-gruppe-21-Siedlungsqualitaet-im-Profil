import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { clampToSwitzerland } from '../config/map-bounds.config';
import { OverpassService, type GroceryStore } from './overpass.service';
import type { LayerPreference } from '../models/layer-preference.model';
import { ZarrMapService } from './zarr-map.service';

export interface RegionOfInterest {
  id: string;
  name: string;
  color: string;
  radius: number;
  lat: number;
  lng: number;
}

type GroceryRegionMap<T> = Record<string, T>;

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
  private readonly overpass = inject(OverpassService);

  private readonly _regions = signal<RegionOfInterest[]>([createDefaultRegion()]);
  private readonly _activeRegionId = signal(this._regions()[0]?.id ?? '');
  private readonly _viewCenter = signal({ lat: 47.3769, lng: 8.5417 });
  private readonly _groceryStoresByRegion = signal<GroceryRegionMap<GroceryStore[]>>({});
  private readonly _groceryCountLoadingByRegion = signal<GroceryRegionMap<boolean>>({});
  private readonly _groceryCountErrorByRegion = signal<GroceryRegionMap<string | null>>({});
  private readonly _groceryStoresEnabled = signal(false);
  private readonly groceryFetchGenerations = new Map<string, number>();
  private readonly groceryAborts = new Map<string, AbortController>();
  private readonly groceryQueryKeys = new Map<string, string>();
  private readonly _address = signal('');

  readonly regions = this._regions.asReadonly();
  readonly activeRegionId = this._activeRegionId.asReadonly();
  readonly activeRegion = computed(
    () => this._regions().find((region) => region.id === this._activeRegionId()) ?? null,
  );
  readonly lat = computed(() => this.activeRegion()?.lat ?? 47.3769);
  readonly lng = computed(() => this.activeRegion()?.lng ?? 8.5417);
  readonly radius = computed(() => this.activeRegion()?.radius ?? 500);
  readonly groceryStores = computed(() => {
    const activeRegionId = this._activeRegionId();
    return this._groceryStoresByRegion()[activeRegionId] ?? [];
  });
  readonly groceryCount = computed(() => this.groceryStores().length);
  readonly groceryCountLoading = computed(() => {
    const activeRegionId = this._activeRegionId();
    return this._groceryCountLoadingByRegion()[activeRegionId] ?? false;
  });
  readonly groceryCountError = computed(() => {
    const activeRegionId = this._activeRegionId();
    return this._groceryCountErrorByRegion()[activeRegionId] ?? null;
  });
  readonly groceryStoresEnabled = this._groceryStoresEnabled.asReadonly();
  readonly address = this._address.asReadonly();

  readonly metrics = this.zarrMap.metrics;
  readonly metricsLoading = this.zarrMap.metricsLoading;
  readonly metricsError = this.zarrMap.metricsError;
  readonly overviewScore = this.zarrMap.overviewScore;
  readonly overviewLoading = this.zarrMap.overviewLoading;
  readonly zarrLayers = this.zarrMap.layerStates;

  constructor() {
    effect((onCleanup) => {
      const activeRegion = this.activeRegion();
      const regions = this._regions();
      const groceryStoresEnabled = this._groceryStoresEnabled();

      if (!activeRegion) {
        this.clearAllGroceryStores();
        return;
      }

      const { lat, lng, radius } = activeRegion;

      if (!groceryStoresEnabled) {
        this.clearAllGroceryStores();
      } else {
        this.clearRemovedRegionGroceryStores(regions);
      }

      const timer = setTimeout(() => {
        void this.zarrMap.sampleLocation(lng, lat);
        if (groceryStoresEnabled) {
          for (const region of regions) {
            void this.fetchGroceryStores(region);
          }
        }
      }, 300);

      onCleanup(() => clearTimeout(timer));
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

  setZarrLayerPreference(layerId: string, preference: LayerPreference): void {
    this.zarrMap.setLayerPreference(layerId, preference);
  }

  /** @deprecated Use setZarrLayerPreference */
  setZarrLayerWeight(layerId: string, weight: number): void {
    this.zarrMap.setLayerWeight(layerId, weight);
  }

  resetZarrLayerPreference(layerId: string): void {
    this.zarrMap.resetLayerPreference(layerId);
  }

  resetAllZarrPreferences(): void {
    this.zarrMap.resetAllPreferences();
  }

  setZarrLayerEnabled(layerId: string, enabled: boolean): void {
    this.zarrMap.setLayerEnabled(layerId, enabled);
  }

  setAllZarrLayersEnabled(enabled: boolean): void {
    this.zarrMap.setAllLayersEnabled(enabled);
  }

  setGroceryStoresEnabled(enabled: boolean): void {
    this._groceryStoresEnabled.set(enabled);
  }

  groceryStoresForRegion(regionId: string): GroceryStore[] {
    return this._groceryStoresByRegion()[regionId] ?? [];
  }

  groceryCountForRegion(regionId: string): number {
    return this.groceryStoresForRegion(regionId).length;
  }

  groceryCountLoadingForRegion(regionId: string): boolean {
    return this._groceryCountLoadingByRegion()[regionId] ?? false;
  }

  groceryCountErrorForRegion(regionId: string): string | null {
    return this._groceryCountErrorByRegion()[regionId] ?? null;
  }

  private clearAllGroceryStores(): void {
    for (const [regionId, abort] of this.groceryAborts) {
      this.groceryFetchGenerations.set(regionId, (this.groceryFetchGenerations.get(regionId) ?? 0) + 1);
      abort.abort();
    }
    this.groceryAborts.clear();
    this.groceryQueryKeys.clear();
    this._groceryStoresByRegion.set({});
    this._groceryCountLoadingByRegion.set({});
    this._groceryCountErrorByRegion.set({});
  }

  private clearRemovedRegionGroceryStores(regions: RegionOfInterest[]): void {
    const regionIds = new Set(regions.map((region) => region.id));

    for (const regionId of this.groceryAborts.keys()) {
      if (!regionIds.has(regionId)) {
        this.clearGroceryStoresForRegion(regionId);
      }
    }
  }

  private clearGroceryStoresForRegion(regionId: string): void {
    this.groceryFetchGenerations.set(regionId, (this.groceryFetchGenerations.get(regionId) ?? 0) + 1);
    this.groceryAborts.get(regionId)?.abort();
    this.groceryAborts.delete(regionId);
    this.groceryQueryKeys.delete(regionId);
    this._groceryStoresByRegion.update(({ [regionId]: _removed, ...stores }) => stores);
    this._groceryCountLoadingByRegion.update(({ [regionId]: _removed, ...loading }) => loading);
    this._groceryCountErrorByRegion.update(({ [regionId]: _removed, ...errors }) => errors);
  }

  private async fetchGroceryStores(region: RegionOfInterest): Promise<void> {
    const queryKey = `${region.lat.toFixed(6)}:${region.lng.toFixed(6)}:${region.radius}`;
    const regionId = region.id;
    const existingStores = this._groceryStoresByRegion();
    const existingError = this._groceryCountErrorByRegion()[regionId] ?? null;
    const isLoading = this._groceryCountLoadingByRegion()[regionId] ?? false;

    if (
      this.groceryQueryKeys.get(regionId) === queryKey &&
      (isLoading || (Object.prototype.hasOwnProperty.call(existingStores, regionId) && existingError === null))
    ) {
      return;
    }

    const generation = (this.groceryFetchGenerations.get(regionId) ?? 0) + 1;
    this.groceryFetchGenerations.set(regionId, generation);
    this.groceryAborts.get(regionId)?.abort();

    const abort = new AbortController();
    this.groceryAborts.set(regionId, abort);
    this.groceryQueryKeys.set(regionId, queryKey);
    this._groceryStoresByRegion.update((stores) => ({ ...stores, [regionId]: [] }));
    this._groceryCountLoadingByRegion.update((loading) => ({ ...loading, [regionId]: true }));
    this._groceryCountErrorByRegion.update((errors) => ({ ...errors, [regionId]: null }));

    try {
      const stores = await this.overpass.getGroceryStores(
        region.lat,
        region.lng,
        region.radius,
        abort.signal,
      );
      if (generation === this.groceryFetchGenerations.get(regionId)) {
        this._groceryStoresByRegion.update((storesByRegion) => ({
          ...storesByRegion,
          [regionId]: stores,
        }));
        this._groceryCountLoadingByRegion.update((loading) => ({
          ...loading,
          [regionId]: false,
        }));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (generation === this.groceryFetchGenerations.get(regionId)) {
        console.warn('Failed to fetch grocery store count:', error);
        this._groceryStoresByRegion.update((storesByRegion) => ({
          ...storesByRegion,
          [regionId]: [],
        }));
        this._groceryCountErrorByRegion.update((errors) => ({
          ...errors,
          [regionId]: 'Unable to load',
        }));
        this._groceryCountLoadingByRegion.update((loading) => ({
          ...loading,
          [regionId]: false,
        }));
      }
    } finally {
      if (generation === this.groceryFetchGenerations.get(regionId)) {
        this.groceryAborts.delete(regionId);
      }
    }
  }
}
