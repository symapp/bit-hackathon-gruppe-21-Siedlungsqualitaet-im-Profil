import { Injectable, signal } from '@angular/core';
import { ZarrLayer, type QueryResult } from '@carbonplan/zarr-layer';
import type { Map as MaplibreMap } from 'maplibre-gl';
import {
  DEFAULT_ACTIVE_ZARR_LAYER_ID,
  SWISS_LV95_PROJ4,
  ZARR_LAYER_DEFINITIONS,
  type ZarrLayerDefinition,
} from '../config/zarr-layers.config';
import {
  EMPTY_LOCATION_METRICS,
  type LocationMetrics,
} from '../models/metrics.model';

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
  active: boolean;
  ready: boolean;
  loading: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ZarrMapService {
  private map: MaplibreMap | null = null;
  private readonly managedLayers = new Map<string, ManagedZarrLayer>();
  private sampleGeneration = 0;
  private sampleAbort: AbortController | null = null;
  private lastSample: { lng: number; lat: number } | null = null;

  readonly activeLayerId = signal<string>(DEFAULT_ACTIVE_ZARR_LAYER_ID);
  readonly metrics = signal<LocationMetrics>({ ...EMPTY_LOCATION_METRICS });
  readonly metricsLoading = signal(false);
  readonly metricsError = signal<string | null>(null);
  readonly layerStates = signal<ZarrLayerState[]>([]);

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
        opacity: 0.82,
        zarrVersion: 3,
        proj4: SWISS_LV95_PROJ4,
        spatialDimensions: { lat: 'y', lon: 'x' },
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

      // ÖV: metadata _FillValue=0, but empty cells are NaN.
      if (definition.id === 'pt-accessibility') {
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

  setActiveLayer(layerId: string): void {
    if (!this.managedLayers.has(layerId)) {
      return;
    }
    this.activeLayerId.set(layerId);
    this.applyLayerVisibility();
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
    const addAll = () => {
      for (const { layer } of this.managedLayers.values()) {
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer);
        }
      }
      this.applyLayerVisibility();
    };

    if (map.loaded()) {
      addAll();
    } else {
      map.once('load', addAll);
    }
  }

  private applyLayerVisibility(): void {
    if (!this.map) {
      return;
    }

    const activeId = this.activeLayerId();

    for (const { layer } of this.managedLayers.values()) {
      if (!this.map.getLayer(layer.id)) {
        continue;
      }

      const isActive = layer.id === activeId;
      this.map.setLayoutProperty(layer.id, 'visibility', isActive ? 'visible' : 'none');
      if (isActive) {
        this.map.moveLayer(layer.id);
      }
    }
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
    }

    this.syncLayerStateSignal();
  }

  private syncLayerStateSignal(): void {
    const activeId = this.activeLayerId();
    this.layerStates.set(
      [...this.managedLayers.values()].map(({ definition, ready, loading }) => ({
        id: definition.id,
        label: definition.label,
        description: definition.description,
        colormap: definition.colormap,
        clim: definition.clim,
        active: definition.id === activeId,
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
  if (Array.isArray(raw) && raw.length > 0) {
    const value = raw[0];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}
