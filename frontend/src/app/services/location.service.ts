import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { clampToSwitzerland } from '../config/map-bounds.config';
import { OverpassService, type GroceryStore } from './overpass.service';
import { ZARR_LAYER_DEFINITIONS } from '../config/zarr-layers.config';
import type { LayerPreference } from '../models/layer-preference.model';
import { EMPTY_LOCATION_METRICS, type LocationMetrics } from '../models/metrics.model';
import { ZarrMapService } from './zarr-map.service';
import { computePreferenceOverview } from '../utils/metrics-aggregate.util';

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
    lat: 46.99718,
    lng: 7.46274,
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
  private readonly _viewCenter = signal({ lat: 46.99718, lng: 7.46274 });
  private readonly _groceryStoresByRegion = signal<GroceryRegionMap<GroceryStore[]>>({});
  private readonly _groceryCountLoadingByRegion = signal<GroceryRegionMap<boolean>>({});
  private readonly _groceryCountErrorByRegion = signal<GroceryRegionMap<string | null>>({});
  private readonly _groceryStoresEnabled = signal(false);
  private readonly groceryFetchGenerations = new Map<string, number>();
  private readonly groceryAborts = new Map<string, AbortController>();
  private readonly groceryQueryKeys = new Map<string, string>();
  private regionsSampleGeneration = 0;
  private regionsSampleAbort: AbortController | null = null;
  private readonly _address = signal('');
  private readonly _regionMetrics = signal<Record<string, LocationMetrics>>({});
  private readonly _regionMetricsLoading = signal(false);

  readonly regions = this._regions.asReadonly();
  readonly activeRegionId = this._activeRegionId.asReadonly();
  readonly activeRegion = computed(
    () => this._regions().find((region) => region.id === this._activeRegionId()) ?? null,
  );
  readonly lat = computed(() => this.activeRegion()?.lat ?? 46.99718);
  readonly lng = computed(() => this.activeRegion()?.lng ?? 7.46274);
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
  readonly regionMetrics = this._regionMetrics.asReadonly();
  readonly regionMetricsLoading = this._regionMetricsLoading.asReadonly();
  readonly regionOverviewScores = computed<Record<string, number | null>>(() => {
    const metricsByRegion = this._regionMetrics();
    const preferences = this.zarrMap.layerPreferences();
    const metaByLayerId = this.zarrMap.layerMeta();
    const scores: Record<string, number | null> = {};
    for (const region of this._regions()) {
      scores[region.id] = computePreferenceOverview(
        metricsByRegion[region.id] ?? { ...EMPTY_LOCATION_METRICS },
        {
          definitions: ZARR_LAYER_DEFINITIONS,
          preferences,
          metaByLayerId,
        },
      );
    }
    return scores;
  });
  readonly overviewScore = this.zarrMap.overviewScore;
  readonly overviewLoading = this.zarrMap.overviewLoading;
  readonly zarrLayers = this.zarrMap.layerStates;

  constructor() {
    effect((onCleanup) => {
      const regions = this._regions();
      const groceryStoresEnabled = this._groceryStoresEnabled();

      if (regions.length === 0) {
        untracked(() => {
          this.clearAllGroceryStores();
          this._regionMetrics.set({});
          this._regionMetricsLoading.set(false);
          this.zarrMap.setMetrics({ ...EMPTY_LOCATION_METRICS });
        });
        return;
      }

      if (!groceryStoresEnabled) {
        untracked(() => this.clearAllGroceryStores());
      } else {
        untracked(() => this.clearRemovedRegionGroceryStores(regions));
      }

      const timer = setTimeout(() => {
        void this.sampleAllRegions();
        if (groceryStoresEnabled) {
          for (const region of regions) {
            void this.fetchGroceryStores(region);
          }
        }
      }, 300);

      onCleanup(() => {
        clearTimeout(timer);
        this.regionsSampleAbort?.abort();
      });
    });

    effect(() => {
      const active = this.activeRegion();
      if (!active) {
        return;
      }

      const cached = this._regionMetrics()[active.id];
      if (cached) {
        this.zarrMap.setMetrics(cached);
      }
    });

    effect((onCleanup) => {
      const regions = this._regions();
      const layerStates = this.zarrMap.layerStates();

      if (regions.length === 0 || layerStates.length === 0) {
        return;
      }

      // Initial region sampling can happen before Zarr layers are ready.
      // Trigger another pass once layer loading has settled so sidebar scores are populated.
      if (layerStates.some((layer) => layer.loading)) {
        return;
      }

      const timer = setTimeout(() => {
        void this.sampleAllRegions();
      }, 150);

      onCleanup(() => clearTimeout(timer));
    });
  }

  private async sampleAllRegions(): Promise<void> {
    const regions = this._regions();
    if (regions.length === 0) {
      return;
    }

    const generation = ++this.regionsSampleGeneration;
    this.regionsSampleAbort?.abort();
    this.regionsSampleAbort = new AbortController();
    const { signal } = this.regionsSampleAbort;

    this._regionMetricsLoading.set(true);
    this.zarrMap.metricsLoading.set(true);
    this.zarrMap.metricsError.set(null);

    try {
      const entries = await Promise.all(
        regions.map(async (region) => {
          const metrics = await this.sampleRegionAverageMetrics(region, signal);
          return [region.id, metrics] as const;
        }),
      );

      if (generation !== this.regionsSampleGeneration || signal.aborted) {
        return;
      }

      const byId = Object.fromEntries(entries);
      this._regionMetrics.set(byId);

      const activeId = this._activeRegionId();
      if (byId[activeId]) {
        this.zarrMap.setMetrics(byId[activeId]);
      }
    } catch (err) {
      if (generation !== this.regionsSampleGeneration || signal.aborted) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Zarr-Abfrage fehlgeschlagen';
      this.zarrMap.metricsError.set(message);
      console.error('[zarr] sampleAllRegions', err);
    } finally {
      if (generation === this.regionsSampleGeneration) {
        this._regionMetricsLoading.set(false);
        this.zarrMap.metricsLoading.set(false);
      }
    }
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
    this._regionMetrics.update((metrics) => {
      const { [regionId]: _, ...rest } = metrics;
      return rest;
    });
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
      this.groceryFetchGenerations.set(
        regionId,
        (this.groceryFetchGenerations.get(regionId) ?? 0) + 1,
      );
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
    const trackedRegionIds = new Set([
      ...Object.keys(this._groceryStoresByRegion()),
      ...Object.keys(this._groceryCountLoadingByRegion()),
      ...Object.keys(this._groceryCountErrorByRegion()),
      ...this.groceryAborts.keys(),
      ...this.groceryQueryKeys.keys(),
    ]);

    for (const regionId of trackedRegionIds) {
      if (!regionIds.has(regionId)) {
        this.clearGroceryStoresForRegion(regionId);
      }
    }
  }

  private clearGroceryStoresForRegion(regionId: string): void {
    this.groceryFetchGenerations.set(
      regionId,
      (this.groceryFetchGenerations.get(regionId) ?? 0) + 1,
    );
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
      (isLoading ||
        (Object.prototype.hasOwnProperty.call(existingStores, regionId) && existingError === null))
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

  overviewScoreForRegion(regionId: string): number | null {
    return this.regionOverviewScores()[regionId] ?? null;
  }

  private async sampleRegionAverageMetrics(
    region: RegionOfInterest,
    signal?: AbortSignal,
  ): Promise<LocationMetrics> {
    const offsets = samplingOffsetsMeters(region.radius);
    const samples = await Promise.all(
      offsets.map(({ dx, dy }) => {
        const sampleLng = region.lng + metersToLngDelta(dx, region.lat);
        const sampleLat = region.lat + metersToLatDelta(dy);
        return this.zarrMap.queryMetricsAt(sampleLng, sampleLat, signal);
      }),
    );
    return averageMetrics(samples);
  }
}

function samplingOffsetsMeters(radiusMeters: number): { dx: number; dy: number }[] {
  const offsets: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }];
  const rings = [
    { radius: radiusMeters * 0.5, count: 8 },
    { radius: radiusMeters, count: 12 },
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

function averageMetrics(samples: readonly LocationMetrics[]): LocationMetrics {
  const keys = Object.keys(EMPTY_LOCATION_METRICS) as (keyof LocationMetrics)[];
  const averaged: LocationMetrics = { ...EMPTY_LOCATION_METRICS };
  for (const key of keys) {
    let sum = 0;
    let count = 0;
    for (const sample of samples) {
      const value = sample[key];
      if (value !== null && Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    }
    averaged[key] = count > 0 ? sum / count : null;
  }
  return averaged;
}
