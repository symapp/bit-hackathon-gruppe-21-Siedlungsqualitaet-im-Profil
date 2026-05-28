import { Injectable, computed, signal } from '@angular/core';
import { ZarrLayer, type QueryResult } from '@carbonplan/zarr-layer';
import type { CustomLayerInterface, ImageSource, Map as MaplibreMap } from 'maplibre-gl';
import { createDefaultLayerPreferences } from '../config/good-place-defaults.config';
import {
  OVERVIEW_MAP_LAYER_ID,
  SWISS_LV95_PROJ4,
  ZARR_LAYER_DEFINITIONS,
  ZARR_LAYERS_WITH_NAN_FILL,
  type ZarrLayerDefinition,
} from '../config/zarr-layers.config';
import type { LayerPreference } from '../models/layer-preference.model';
import {
  settlementLayerMetaUrl,
  type SettlementLayerMeta,
} from '../models/settlement-layer-meta.model';
import { EMPTY_LOCATION_METRICS, type LocationMetrics } from '../models/metrics.model';
import { clampLayerPreference } from '../utils/preference-scoring.util';
import { computePreferenceOverview } from '../utils/metrics-aggregate.util';
import { overviewCompositeDebounceMs, resolveOverviewLod } from '../utils/overview-lod.util';
import { viewportCellExtent } from '../utils/swiss-grid.util';
import { OverviewRawCache } from './overview-raw-cache';
import {
  extentCacheKey,
  fetchOverviewRawMaps,
  preferencesFingerprint,
  scoreOverviewComposite,
  type OverviewCompositeResult,
} from './settlement-overview-composite';
import { exposeOverviewForE2e, type OverviewE2eState } from '../testing/e2e-overview.harness';

interface ManagedZarrLayer {
  definition: ZarrLayerDefinition;
  layer: ZarrLayer;
  ready: boolean;
  loading: boolean;
}

export interface ZarrLayerState {
  id: string;
  labelKey: string;
  descriptionKey: string;
  colormap: string[];
  clim: [number, number];
  enabled: boolean;
  preference: LayerPreference;
  meta: SettlementLayerMeta | null;
  metaFromFallback: boolean;
  ready: boolean;
  loading: boolean;
}

const OVERVIEW_SOURCE_ID = 'settlement-overview-image';
const SINGLE_LAYER_OPACITY = 0.82;

@Injectable({
  providedIn: 'root',
})
export class ZarrMapService {
  private map: MaplibreMap | null = null;
  private readonly managedLayers = new Map<string, ManagedZarrLayer>();
  private sampleGeneration = 0;
  private sampleAbort: AbortController | null = null;
  private compositeAbort: AbortController | null = null;
  private compositeDebounce: ReturnType<typeof setTimeout> | null = null;
  private rescoreDebounce: ReturnType<typeof setTimeout> | null = null;
  private lastSample: { lng: number; lat: number } | null = null;
  private overviewDataUrl: string | null = null;
  private readonly rawCache = new OverviewRawCache(32);
  private lastExtentKey: string | null = null;
  private lastLodTier: string | null = null;
  private lastRawByLayerId = new Map<string, Map<string, number>>();
  private lastCompositeFingerprint: string | null = null;
  private overviewGeneration = 0;
  private lastFetchLayerCount = 0;
  private readonly onMapViewChange = (): void => this.scheduleOverviewComposite();

  readonly layerPreferences = signal<Record<string, LayerPreference>>(
    createDefaultLayerPreferences(),
  );
  readonly layerMeta = signal<Record<string, SettlementLayerMeta | null>>({});
  readonly metaFallback = signal<Record<string, boolean>>({});
  readonly metrics = signal<LocationMetrics>({ ...EMPTY_LOCATION_METRICS });
  readonly metricsLoading = signal(false);
  readonly metricsError = signal<string | null>(null);
  readonly layerStates = signal<ZarrLayerState[]>([]);
  readonly overviewLoading = signal(false);
  readonly overviewCacheStats = signal(this.rawCache.stats());
  readonly overviewScore = computed(() =>
    computePreferenceOverview(this.metrics(), {
      definitions: ZARR_LAYER_DEFINITIONS,
      preferences: this.layerPreferences(),
      metaByLayerId: this.layerMeta(),
    }),
  );

  attachToMap(map: MaplibreMap): void {
    if (this.map === map && this.managedLayers.size > 0) {
      return;
    }

    this.detachFromMap();
    this.map = map;

    for (const definition of ZARR_LAYER_DEFINITIONS) {
      const layerOptions: ConstructorParameters<typeof ZarrLayer>[0] = {
        id: definition.id,
        source: definition.storePath,
        variable: definition.variable,
        selector: definition.selector,
        bounds: definition.bounds,
        fillValue: definition.fillValue,
        colormap: definition.colormap,
        clim: definition.clim,
        opacity: 0,
        zarrVersion: 3,
        proj4: SWISS_LV95_PROJ4,
        spatialDimensions: { lat: 'y', lon: 'x' },
        latIsAscending: definition.latIsAscending,
        onLoadingStateChange: (state) => {
          this.updateLayerState(definition.id, {
            loading: state.loading || state.metadata,
            ready: !state.loading && !state.metadata && !state.error,
          });
          if (state.error) {
            console.error(`[zarr] ${definition.id}`, state.error);
          }
        },
      };

      if (definition.fillValue !== undefined) {
        layerOptions.fillValue = definition.fillValue;
      } else if (ZARR_LAYERS_WITH_NAN_FILL.has(definition.id)) {
        layerOptions.fillValue = Number.NaN;
      }

      const layer = new ZarrLayer(layerOptions);

      this.managedLayers.set(definition.id, {
        definition,
        layer,
        ready: false,
        loading: true,
      });

      void this.fetchLayerMeta(definition);
    }

    this.syncLayerStateSignal();
    this.installLayersOnMap(map);
    exposeOverviewForE2e(() => this.getOverviewE2eState());
  }

  detachFromMap(): void {
    if (this.map) {
      this.map.off('moveend', this.onMapViewChange);
      this.map.off('zoomend', this.onMapViewChange);
      for (const { layer } of this.managedLayers.values()) {
        if (this.map.getLayer(layer.id)) {
          this.map.removeLayer(layer.id);
        }
      }
      if (this.map.getLayer(OVERVIEW_MAP_LAYER_ID)) {
        this.map.removeLayer(OVERVIEW_MAP_LAYER_ID);
      }
      if (this.map.getSource(OVERVIEW_SOURCE_ID)) {
        this.map.removeSource(OVERVIEW_SOURCE_ID);
      }
    }
    if (this.overviewDataUrl) {
      URL.revokeObjectURL(this.overviewDataUrl);
      this.overviewDataUrl = null;
    }
    this.rawCache.clear();
    this.lastRawByLayerId.clear();
    this.lastExtentKey = null;
    this.managedLayers.clear();
    this.map = null;
    this.syncLayerStateSignal();
  }

  setLayerPreference(layerId: string, preference: LayerPreference): void {
    if (!this.managedLayers.has(layerId)) {
      return;
    }
    this.layerPreferences.update((prev) => ({
      ...prev,
      [layerId]: clampLayerPreference(preference),
    }));
    this.applyLayerDisplay({ rescoreOnly: true });
    this.syncLayerStateSignal();
  }

  resetLayerPreference(layerId: string): void {
    const defaults = createDefaultLayerPreferences();
    if (defaults[layerId]) {
      this.setLayerPreference(layerId, defaults[layerId]);
    }
  }

  resetAllPreferences(): void {
    this.layerPreferences.set(createDefaultLayerPreferences());
    this.applyLayerDisplay({ rescoreOnly: true });
    this.syncLayerStateSignal();
  }

  setLayerEnabled(layerId: string, enabled: boolean): void {
    if (!this.managedLayers.has(layerId)) {
      return;
    }
    const current = this.layerPreferences()[layerId];
    if (!current) {
      return;
    }
    this.setLayerPreference(layerId, { ...current, enabled });
  }

  setAllLayersEnabled(enabled: boolean): void {
    this.layerPreferences.update((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        next[id] = { ...next[id], enabled };
      }
      return next;
    });
    this.applyLayerDisplay({ rescoreOnly: !enabled });
    this.syncLayerStateSignal();
  }

  /** @deprecated Use setLayerPreference */
  setLayerWeight(layerId: string, weight: number): void {
    const current = this.layerPreferences()[layerId];
    if (!current) {
      return;
    }
    this.setLayerPreference(layerId, { ...current, importance: weight });
  }

  async sampleLocation(lng: number, lat: number): Promise<void> {
    this.lastSample = { lng, lat };
    const generation = ++this.sampleGeneration;
    this.sampleAbort?.abort();
    this.sampleAbort = new AbortController();
    const { signal } = this.sampleAbort;

    this.metricsLoading.set(true);
    this.metricsError.set(null);

    const point = { type: 'Point' as const, coordinates: [lng, lat] as [number, number] };
    const next: LocationMetrics = { ...EMPTY_LOCATION_METRICS };

    try {
      await Promise.all(
        [...this.managedLayers.values()].map(async ({ definition, layer, ready }) => {
          if (!ready) {
            return;
          }

          const result = await layer.queryData(point, definition.selector, { signal });
          if (generation !== this.sampleGeneration) {
            return;
          }

          const value = extractScalar(result, definition.variable);
          next[definition.metricKey] = value;
        }),
      );

      if (generation === this.sampleGeneration) {
        this.metrics.set(next);
      }
    } catch (err) {
      if (generation !== this.sampleGeneration || signal.aborted) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Zarr-Abfrage fehlgeschlagen';
      this.metricsError.set(message);
      console.error('[zarr] sampleLocation', err);
    } finally {
      if (generation === this.sampleGeneration) {
        this.metricsLoading.set(false);
      }
    }
  }

  private async fetchLayerMeta(definition: ZarrLayerDefinition): Promise<void> {
    const url = settlementLayerMetaUrl(definition.storePath);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const meta = (await res.json()) as SettlementLayerMeta;
      this.layerMeta.update((prev) => ({ ...prev, [definition.id]: meta }));
      this.metaFallback.update((prev) => ({ ...prev, [definition.id]: false }));
      const managed = this.managedLayers.get(definition.id);
      if (managed?.ready) {
        managed.layer.setClim([meta.p5, meta.p95]);
      }
    } catch {
      console.warn(`[zarr] meta fallback for ${definition.id} (using clim)`);
      this.layerMeta.update((prev) => ({ ...prev, [definition.id]: null }));
      this.metaFallback.update((prev) => ({ ...prev, [definition.id]: true }));
    }
    this.syncLayerStateSignal();
    this.scheduleOverviewRescore();
  }

  private installLayersOnMap(map: MaplibreMap): void {
    const addLayers = () => {
      for (const { layer } of this.managedLayers.values()) {
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer as unknown as CustomLayerInterface);
        }
      }
      if (!map.getSource(OVERVIEW_SOURCE_ID)) {
        map.addSource(OVERVIEW_SOURCE_ID, {
          type: 'image',
          url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          coordinates: [
            [8.2, 47.5],
            [8.8, 47.5],
            [8.8, 47.0],
            [8.2, 47.0],
          ],
        });
      }
      if (!map.getLayer(OVERVIEW_MAP_LAYER_ID)) {
        map.addLayer({
          id: OVERVIEW_MAP_LAYER_ID,
          type: 'raster',
          source: OVERVIEW_SOURCE_ID,
          paint: {
            'raster-opacity': 0.88,
            'raster-resampling': 'nearest',
            'raster-fade-duration': 0,
          },
        });
      }
      map.on('moveend', this.onMapViewChange);
      map.on('zoomend', this.onMapViewChange);
      this.applyLayerDisplay();
    };

    if (map.loaded()) {
      addLayers();
    } else {
      map.once('load', addLayers);
    }
  }

  private applyLayerDisplay(options?: { rescoreOnly?: boolean }): void {
    if (!this.map) {
      return;
    }

    const preferences = this.layerPreferences();
    const hasOverview = Object.entries(preferences).some(
      ([id, pref]) => pref.enabled && pref.importance > 0 && this.managedLayers.get(id)?.ready,
    );

    for (const { definition, layer } of this.managedLayers.values()) {
      if (!this.map.getLayer(layer.id)) {
        continue;
      }
      const pref = preferences[definition.id];
      const showSingle = pref?.enabled && pref.importance > 0 && !hasOverview;
      layer.setOpacity(showSingle ? SINGLE_LAYER_OPACITY : 0);
    }

    if (this.map.getLayer(OVERVIEW_MAP_LAYER_ID)) {
      this.map.setLayoutProperty(
        OVERVIEW_MAP_LAYER_ID,
        'visibility',
        hasOverview ? 'visible' : 'none',
      );
    }

    if (options?.rescoreOnly) {
      this.scheduleOverviewRescore();
    } else {
      this.scheduleOverviewComposite();
    }
    this.map.triggerRepaint();
  }

  private scheduleOverviewRescore(): void {
    if (this.rescoreDebounce) {
      clearTimeout(this.rescoreDebounce);
    }
    this.rescoreDebounce = setTimeout(() => void this.runOverviewRescore(), 50);
  }

  private scheduleOverviewComposite(): void {
    if (this.compositeDebounce) {
      clearTimeout(this.compositeDebounce);
    }
    let delayMs = 300;
    if (this.map) {
      const b = this.map.getBounds();
      const extent = viewportCellExtent(
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      );
      if (extent) {
        const plan = resolveOverviewLod(this.map.getZoom(), extent.fullNx, extent.fullNy);
        delayMs = overviewCompositeDebounceMs(plan);
      }
    }
    this.compositeDebounce = setTimeout(() => void this.runOverviewComposite(), delayMs);
  }

  private buildSources(plan: ReturnType<typeof resolveOverviewLod>) {
    return [...this.managedLayers.values()].map(({ definition, layer, ready }) => ({
      definition,
      ready,
      queryContext: { definition, layer, plan },
    }));
  }

  private async runOverviewRescore(): Promise<void> {
    if (!this.map || this.lastExtentKey === null || this.lastRawByLayerId.size === 0) {
      await this.runOverviewComposite();
      return;
    }

    const bounds = this.map.getBounds();
    const extent = viewportCellExtent(
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    );
    if (!extent || extentCacheKey(extent) !== this.lastExtentKey) {
      await this.runOverviewComposite();
      return;
    }

    const preferences = this.layerPreferences();
    const activeIds = [...this.managedLayers.keys()].filter((id) => {
      const p = preferences[id];
      return p?.enabled && p.importance > 0;
    });
    const fingerprint = `${this.lastExtentKey}|${preferencesFingerprint(preferences, activeIds)}`;
    if (fingerprint === this.lastCompositeFingerprint) {
      return;
    }

    const plan = resolveOverviewLod(this.map.getZoom(), extent.fullNx, extent.fullNy);
    const sources = this.buildSources(plan);

    const missing = sources.filter((s) => {
      const pref = preferences[s.definition.id];
      return s.ready && pref?.enabled && pref.importance > 0 && !this.lastRawByLayerId.has(s.definition.id);
    });

    if (missing.length > 0) {
      this.compositeAbort?.abort();
      this.compositeAbort = new AbortController();
      const { signal } = this.compositeAbort;
      this.lastFetchLayerCount = 0;
      const fetched = await fetchOverviewRawMaps(
        {
          sources: missing,
          preferences,
          metaByLayerId: this.layerMeta(),
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
          zoom: this.map.getZoom(),
          plan,
          rawCache: this.rawCache,
          signal,
          onFetchLayer: () => {
            this.lastFetchLayerCount += 1;
          },
        },
        extent,
      );
      if (signal.aborted) {
        return;
      }
      for (const [id, map] of fetched) {
        this.lastRawByLayerId.set(id, map);
      }
    }

    const composite = scoreOverviewComposite({
      rawByLayerId: this.lastRawByLayerId,
      sources,
      preferences,
      metaByLayerId: this.layerMeta(),
      extent,
    });

    this.overviewGeneration += 1;
    this.lastCompositeFingerprint = fingerprint;
    this.overviewCacheStats.set(this.rawCache.stats());
    await this.applyCompositeToMap(composite);
  }

  private async runOverviewComposite(): Promise<void> {
    if (!this.map) {
      return;
    }

    this.compositeAbort?.abort();
    this.compositeAbort = new AbortController();
    const { signal } = this.compositeAbort;

    const bounds = this.map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const zoom = this.map.getZoom();

    const extent = viewportCellExtent(west, south, east, north);
    if (!extent) {
      return;
    }

    const plan = resolveOverviewLod(zoom, extent.fullNx, extent.fullNy);
    const tierChanged = this.lastLodTier !== null && this.lastLodTier !== plan.tier;
    if (tierChanged) {
      this.rawCache.clear();
    }
    this.lastLodTier = plan.tier;

    this.overviewLoading.set(true);
    this.lastFetchLayerCount = 0;

    const sources = this.buildSources(plan);
    const preferences = this.layerPreferences();

    try {
      const rawByLayerId = await fetchOverviewRawMaps(
        {
          sources,
          preferences,
          metaByLayerId: this.layerMeta(),
          west,
          south,
          east,
          north,
          zoom,
          plan,
          rawCache: this.rawCache,
          signal,
          onFetchLayer: () => {
            this.lastFetchLayerCount += 1;
          },
        },
        extent,
      );

      if (signal.aborted || !this.map) {
        return;
      }

      this.lastRawByLayerId = rawByLayerId;
      this.lastExtentKey = extentCacheKey(extent);

      const activeIds = [...this.managedLayers.keys()].filter((id) => {
        const p = preferences[id];
        return p?.enabled && p.importance > 0;
      });
      this.lastCompositeFingerprint = `${this.lastExtentKey}|${preferencesFingerprint(preferences, activeIds)}`;

      const composite = scoreOverviewComposite({
        rawByLayerId,
        sources,
        preferences,
        metaByLayerId: this.layerMeta(),
        extent,
      });

      this.overviewGeneration += 1;
      this.overviewCacheStats.set(this.rawCache.stats());
      await this.applyCompositeToMap(composite);
    } finally {
      if (!signal.aborted) {
        this.overviewLoading.set(false);
      }
    }
  }

  private async applyCompositeToMap(composite: OverviewCompositeResult | null): Promise<void> {
    if (!this.map) {
      return;
    }

    const source = this.map.getSource(OVERVIEW_SOURCE_ID) as ImageSource | undefined;
    if (!source || !composite) {
      return;
    }

    if (this.overviewDataUrl) {
      URL.revokeObjectURL(this.overviewDataUrl);
    }
    this.overviewDataUrl = composite.canvas.toDataURL('image/png');
    source.updateImage({
      url: this.overviewDataUrl,
      coordinates: composite.coordinates,
    });
    this.map.triggerRepaint();
  }

  private getOverviewE2eState(): OverviewE2eState {
    return {
      generation: this.overviewGeneration,
      lastFetchLayerCount: this.lastFetchLayerCount,
      cacheHits: this.rawCache.stats().hits,
      cacheMisses: this.rawCache.stats().misses,
      loading: this.overviewLoading(),
    };
  }

  private updateLayerState(
    id: string,
    patch: Partial<Pick<ManagedZarrLayer, 'ready' | 'loading'>>,
  ): void {
    const managed = this.managedLayers.get(id);
    if (!managed) {
      return;
    }

    if (patch.loading !== undefined) {
      managed.loading = patch.loading;
    }

    if (patch.ready !== undefined) {
      const becameReady = patch.ready && !managed.ready;
      managed.ready = patch.ready;
      if (becameReady && this.lastSample) {
        void this.sampleLocation(this.lastSample.lng, this.lastSample.lat);
      }
      if (patch.ready) {
        this.applyLayerDisplay();
        this.map?.triggerRepaint();
      }
    }

    this.syncLayerStateSignal();
  }

  private syncLayerStateSignal(): void {
    const preferences = this.layerPreferences();
    const meta = this.layerMeta();
    const fallback = this.metaFallback();
    this.layerStates.set(
      [...this.managedLayers.values()].map(({ definition, ready, loading }) => ({
        id: definition.id,
        labelKey: definition.labelKey,
        descriptionKey: definition.descriptionKey,
        colormap: definition.colormap,
        clim: definition.clim,
        enabled: preferences[definition.id]?.enabled !== false,
        preference: preferences[definition.id] ?? createDefaultLayerPreferences()[definition.id],
        meta: meta[definition.id] ?? null,
        metaFromFallback: fallback[definition.id] ?? true,
        ready,
        loading,
      })),
    );
  }
}

function extractScalar(result: QueryResult, variable: string): number | null {
  const raw = result[variable];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'bigint') {
    return Number(raw);
  }
  if (Array.isArray(raw) || ArrayBuffer.isView(raw)) {
    const arr = raw as unknown as ArrayLike<unknown>;
    if (arr.length > 0) {
      const value = arr[0];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'bigint') {
        return Number(value);
      }
    }
  }
  return null;
}
