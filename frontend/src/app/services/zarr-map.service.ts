import { Injectable, computed, signal } from '@angular/core';
import { ZarrLayer, type QueryResult } from '@carbonplan/zarr-layer';
import type { CustomLayerInterface, Map as MaplibreMap } from 'maplibre-gl';
import {
  createDefaultLayerEnabled,
  createDefaultLayerWeights,
  OVERVIEW_COLORMAP,
  SWISS_LV95_PROJ4,
  ZARR_LAYER_DEFINITIONS,
  ZARR_LAYERS_WITH_NAN_FILL,
  type ZarrLayerDefinition,
} from '../config/zarr-layers.config';
import { EMPTY_LOCATION_METRICS, type LocationMetrics } from '../models/metrics.model';
import { computeWeightedOverview } from '../utils/metrics-aggregate.util';

interface ManagedZarrLayer {
  definition: ZarrLayerDefinition;
  layer: ZarrLayer;
  ready: boolean;
  loading: boolean;
}

export interface ZarrLayerState {
  id: string;
  label: string;
  description: string;
  colormap: string[];
  clim: [number, number];
  enabled: boolean;
  weight: number;
  ready: boolean;
  loading: boolean;
}

const MAP_LAYER_OPACITY = 0.82;

@Injectable({
  providedIn: 'root',
})
export class ZarrMapService {
  private map: MaplibreMap | null = null;
  private readonly managedLayers = new Map<string, ManagedZarrLayer>();
  private sampleGeneration = 0;
  private sampleAbort: AbortController | null = null;
  private lastSample: { lng: number; lat: number } | null = null;

  readonly layerWeights = signal<Record<string, number>>(createDefaultLayerWeights());
  readonly layerEnabled = signal<Record<string, boolean>>(createDefaultLayerEnabled());
  readonly metrics = signal<LocationMetrics>({ ...EMPTY_LOCATION_METRICS });
  readonly metricsLoading = signal(false);
  readonly metricsError = signal<string | null>(null);
  readonly layerStates = signal<ZarrLayerState[]>([]);
  readonly overviewScore = computed(() =>
    computeWeightedOverview(
      this.metrics(),
      ZARR_LAYER_DEFINITIONS,
      this.layerWeights(),
      this.layerEnabled(),
    ),
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
        colormap: [...OVERVIEW_COLORMAP],
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
    }

    this.syncLayerStateSignal();
    this.installLayersOnMap(map);
  }

  detachFromMap(): void {
    if (this.map) {
      for (const { layer } of this.managedLayers.values()) {
        if (this.map.getLayer(layer.id)) {
          this.map.removeLayer(layer.id);
        }
      }
    }
    this.managedLayers.clear();
    this.map = null;
    this.syncLayerStateSignal();
  }

  setLayerWeight(layerId: string, weight: number): void {
    if (!this.managedLayers.has(layerId)) {
      return;
    }
    this.layerWeights.update((prev) => ({ ...prev, [layerId]: Math.max(0, weight) }));
    this.applyOverviewLayerDisplay();
    this.syncLayerStateSignal();
  }

  setLayerEnabled(layerId: string, enabled: boolean): void {
    if (!this.managedLayers.has(layerId)) {
      return;
    }
    this.layerEnabled.update((prev) => ({ ...prev, [layerId]: enabled }));
    this.applyOverviewLayerDisplay();
    this.syncLayerStateSignal();
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

  private installLayersOnMap(map: MaplibreMap): void {
    const addLayers = () => {
      for (const { layer } of this.managedLayers.values()) {
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer as unknown as CustomLayerInterface);
        }
      }
      this.applyOverviewLayerDisplay();
    };

    if (map.loaded()) {
      addLayers();
    } else {
      map.once('load', addLayers);
    }
  }

  /**
   * Weighted overview on the map: enabled factors share the 0–100 colormap;
   * opacity is proportional to weight so the stack reads as one combined layer.
   */
  private applyOverviewLayerDisplay(): void {
    if (!this.map) {
      return;
    }

    const weights = this.layerWeights();
    const enabled = this.layerEnabled();
    const activeWeights = [...this.managedLayers.keys()]
      .filter((id) => enabled[id] !== false)
      .map((id) => weights[id] ?? 0)
      .filter((w) => w > 0);
    const maxWeight = Math.max(...activeWeights, 1);

    for (const { definition, layer } of this.managedLayers.values()) {
      if (!this.map.getLayer(layer.id)) {
        continue;
      }

      const isOn = enabled[definition.id] !== false;
      const w = weights[definition.id] ?? 0;
      const opacity = isOn && w > 0 ? (w / maxWeight) * MAP_LAYER_OPACITY : 0;

      layer.setOpacity(opacity);

      if (isOn && w > 0) {
        this.map.moveLayer(layer.id);
      }
    }

    this.map.triggerRepaint();
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
        this.applyOverviewLayerDisplay();
        this.map?.triggerRepaint();
      }
    }

    this.syncLayerStateSignal();
  }

  private syncLayerStateSignal(): void {
    const weights = this.layerWeights();
    const enabled = this.layerEnabled();
    this.layerStates.set(
      [...this.managedLayers.values()].map(({ definition, ready, loading }) => ({
        id: definition.id,
        label: definition.label,
        description: definition.description,
        colormap: definition.colormap,
        clim: definition.clim,
        enabled: enabled[definition.id] !== false,
        weight: weights[definition.id] ?? 0,
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
    const arr = raw as unknown as ArrayLike<any>;
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
