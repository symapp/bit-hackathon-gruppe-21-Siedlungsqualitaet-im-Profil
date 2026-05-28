import { Injectable, signal } from '@angular/core';
import { ZarrLayer, type QueryResult } from '@carbonplan/zarr-layer';
import type { Map as MaplibreMap } from 'maplibre-gl';
import {
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
  visible: boolean;
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

  readonly metrics = signal<LocationMetrics>({ ...EMPTY_LOCATION_METRICS });
  readonly metricsLoading = signal(false);
  readonly metricsError = signal<string | null>(null);
  readonly layerStates = signal<
    { id: string; label: string; visible: boolean; ready: boolean; loading: boolean }[]
  >([]);

  attachToMap(map: MaplibreMap): void {
    if (this.map === map && this.managedLayers.size > 0) {
      return;
    }

    this.detachFromMap();
    this.map = map;

    for (const definition of ZARR_LAYER_DEFINITIONS) {
      const layer = new ZarrLayer({
        id: definition.id,
        source: definition.storePath,
        variable: definition.variable,
        selector: definition.selector,
        colormap: definition.colormap,
        clim: definition.clim,
        opacity: 0.72,
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
      });

      this.managedLayers.set(definition.id, {
        definition,
        layer,
        ready: false,
        loading: true,
        visible: definition.defaultVisible,
      });
    }

    this.syncLayerStateSignal();

    map.on('load', () => {
      for (const { layer, visible } of this.managedLayers.values()) {
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer);
        }
        map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
      }
    });

    if (map.loaded()) {
      for (const { layer, visible } of this.managedLayers.values()) {
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer);
        }
        map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
      }
    }
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

  setLayerVisible(layerId: string, visible: boolean): void {
    const managed = this.managedLayers.get(layerId);
    if (!managed) {
      return;
    }

    managed.visible = visible;
    if (this.map?.getLayer(layerId)) {
      this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
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
    this.layerStates.set(
      [...this.managedLayers.values()].map(({ definition, ready, loading, visible }) => ({
        id: definition.id,
        label: definition.label,
        visible,
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
