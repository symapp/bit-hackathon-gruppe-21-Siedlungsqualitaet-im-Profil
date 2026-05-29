import { Component, OnInit, OnDestroy, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { LocationService, type RegionOfInterest } from '../../services/location.service';
import type { GroceryStore } from '../../services/overpass.service';
import { ZarrMapService } from '../../services/zarr-map.service';
import { GeocodingService } from '../../services/geocoding.service';
import { exposeMapForE2e } from '../../testing/e2e-map.harness';
import { Map, NavigationControl, Marker } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, PolygonLayer, IconLayer } from '@deck.gl/layers';

const GROCERY_ICON =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iOSIgY3k9IjIxIiByPSIxIj48L2NpcmNsZT48Y2lyY2xlIGN4PSIyMCIgY3k9IjIxIiByPSIxIj48L2NpcmNsZT48cGF0aCBkPSJNMSAxaDRsMi42OCAxMy4zOWEyIDIgMCAwIDAgMiAxLjYxaDkuNzJhMiAyIDAgMCAwIDItMS42MUwyMyA2SDYiPjwvcGF0aD48L3N2Zz4=';
import { clampToSwitzerland, SWITZERLAND_MAX_BOUNDS } from '../../config/map-bounds.config';
import { mapUiPaddingEquals, readMapUiPadding } from '../../utils/map-ui-insets.util';
import type { PaddingOptions } from 'maplibre-gl';

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private map!: Map;
  private marker!: Marker;
  private deckOverlay!: MapboxOverlay;
  private locationService = inject(LocationService);
  private zarrMapService = inject(ZarrMapService);
  private geocodingService = inject(GeocodingService);
  private lastFlyToRegionKey: string | null = null;
  private reverseAbort: AbortController | null = null;
  private lastUiPadding: PaddingOptions = { top: 0, bottom: 0, left: 0, right: 0 };
  private uiPaddingCleanup: (() => void) | null = null;
  private readonly onUiPaddingChange = (): void => {
    this.applyUiPadding();
  };

  constructor() {
    effect(() => {
      const regions = this.locationService.regions();
      const activeRegion = this.locationService.activeRegion();
      const groceryStores = this.locationService.groceryStores();

      if (this.map && this.marker && this.deckOverlay) {
        this.updateDeckLayers(regions, activeRegion?.id ?? '', groceryStores);

        if (!activeRegion) {
          this.marker.getElement().style.display = 'none';
          return;
        }

        this.marker.getElement().style.display = '';
        this.marker.setLngLat([activeRegion.lng, activeRegion.lat]);

        const flyKey = `${activeRegion.id}:${activeRegion.lng.toFixed(5)},${activeRegion.lat.toFixed(5)}`;
        if (this.lastFlyToRegionKey !== flyKey && this.map.getZoom() >= 10) {
          this.lastFlyToRegionKey = flyKey;
          this.map.flyTo({ center: [activeRegion.lng, activeRegion.lat], essential: true });
        } else if (this.lastFlyToRegionKey !== flyKey) {
          this.lastFlyToRegionKey = flyKey;
        }
      }
    });
  }

  ngOnInit(): void {
    this.initMap();
    const activeRegion = this.locationService.activeRegion();
    if (activeRegion) {
      void this.applyReverseAutoName(activeRegion.lat, activeRegion.lng);
    }
  }

  ngOnDestroy(): void {
    this.reverseAbort?.abort();
    this.uiPaddingCleanup?.();
    this.uiPaddingCleanup = null;
    this.zarrMapService.detachFromMap();
    if (this.deckOverlay) {
      this.deckOverlay.finalize();
    }
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap(): void {
    const activeRegion = this.locationService.activeRegion();
    const lat = activeRegion?.lat ?? 46.99718;
    const lng = activeRegion?.lng ?? 7.46274;
    this.locationService.setViewCenter(lat, lng);

    this.map = new Map({
      container: this.mapContainer.nativeElement,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [lng, lat],
      zoom: 14,
      maxBounds: SWITZERLAND_MAX_BOUNDS,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    this.map.addControl(new NavigationControl(), 'top-left');

    this.marker = new Marker({
      draggable: true,
      color: '#6366f1',
    })
      .setLngLat([lng, lat])
      .addTo(this.map);

    this.marker.on('drag', () => {
      const lngLat = this.marker.getLngLat();
      const clamped = clampToSwitzerland(lngLat.lng, lngLat.lat);
      if (clamped.lng !== lngLat.lng || clamped.lat !== lngLat.lat) {
        this.marker.setLngLat([clamped.lng, clamped.lat]);
      }
    });

    this.marker.on('dragend', () => {
      void this.handleMarkerDragEnd();
    });

    this.deckOverlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
    });

    this.map.addControl(this.deckOverlay as any);
    exposeMapForE2e(this.map);
    this.zarrMapService.attachToMap(this.map);

    this.map.on('moveend', () => {
      const center = this.map.getCenter();
      this.locationService.setViewCenter(center.lat, center.lng);
    });

    this.map.on('load', () => {
      this.applyUiPadding();
      this.setupUiPaddingSync();
      const regions = this.locationService.regions();
      const currentActiveRegion = this.locationService.activeRegion();
      this.updateDeckLayers(
        regions,
        currentActiveRegion?.id ?? '',
        this.locationService.groceryStores(),
      );
      const center = this.map.getCenter();
      this.locationService.setViewCenter(center.lat, center.lng);
    });
  }

  private applyUiPadding(): void {
    if (!this.map) {
      return;
    }
    const padding = readMapUiPadding();
    if (mapUiPaddingEquals(padding, this.lastUiPadding)) {
      return;
    }
    this.lastUiPadding = padding;
    this.map.setPadding(padding);
    this.map.resize();
  }

  private setupUiPaddingSync(): void {
    this.uiPaddingCleanup?.();

    const observed = new Set<Element>();
    const resizeObserver = new ResizeObserver(() => this.applyUiPadding());
    const observe = (selector: string): void => {
      const element = document.querySelector(selector);
      if (element && !observed.has(element)) {
        observed.add(element);
        resizeObserver.observe(element);
      }
    };

    for (const selector of ['.regions-sidebar', '.sidebar', '.search-container']) {
      observe(selector);
    }
    resizeObserver.observe(document.body);

    const mutationObserver = new MutationObserver(() => {
      for (const selector of ['.regions-sidebar', '.sidebar']) {
        observe(selector);
      }
      this.applyUiPadding();
    });
    for (const selector of ['.regions-sidebar', '.sidebar']) {
      const element = document.querySelector(selector);
      if (element) {
        mutationObserver.observe(element, { attributes: true, attributeFilter: ['class'] });
      }
    }

    window.addEventListener('resize', this.onUiPaddingChange);
    this.uiPaddingCleanup = () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', this.onUiPaddingChange);
    };
  }

  private updateDeckLayers(
    regions: RegionOfInterest[],
    activeRegionId: string,
    groceryStores: GroceryStore[],
  ): void {
    const circleData = regions.map((region) => {
      const baseColor = this.hexToRgb(region.color);
      const isActive = region.id === activeRegionId;

      return {
        polygon: this.createCirclePolygon(region.lng, region.lat, region.radius),
        center: [region.lng, region.lat] as [number, number],
        fillColor: [baseColor[0], baseColor[1], baseColor[2], isActive ? 46 : 24] as [
          number,
          number,
          number,
          number,
        ],
        lineColor: [baseColor[0], baseColor[1], baseColor[2], isActive ? 220 : 140] as [
          number,
          number,
          number,
          number,
        ],
        pointColor: [baseColor[0], baseColor[1], baseColor[2], isActive ? 240 : 190] as [
          number,
          number,
          number,
          number,
        ],
        pointRadius: isActive ? 8 : 6,
      };
    });

    const layers = [
      new PolygonLayer({
        id: 'region-circles-fill',
        data: circleData,
        getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
        getFillColor: (d: { fillColor: [number, number, number, number] }) => d.fillColor,
        getLineColor: (d: { lineColor: [number, number, number, number] }) => d.lineColor,
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        filled: true,
        stroked: true,
        pickable: false,
      }),
      new ScatterplotLayer({
        id: 'region-center-points',
        data: circleData,
        getPosition: (d: { center: [number, number] }) => d.center,
        getFillColor: (d: { pointColor: [number, number, number, number] }) => d.pointColor,
        getRadius: (d: { pointRadius: number }) => d.pointRadius,
        radiusUnits: 'pixels',
        filled: true,
        pickable: false,
      }),
      new IconLayer<GroceryStore>({
        id: 'grocery-store-icons',
        data: groceryStores,
        getPosition: (store) => [store.lng, store.lat],
        getIcon: () => ({
          url: GROCERY_ICON,
          width: 24,
          height: 24,
          mask: true,
        }),
        getSize: 22,
        getColor: [216, 35, 42, 255],
        sizeUnits: 'pixels',
        pickable: false,
      }),
    ];

    this.deckOverlay.setProps({ layers });
  }

  private createCirclePolygon(lng: number, lat: number, radiusMeters: number): [number, number][] {
    const points = 64;
    const coords: [number, number][] = [];

    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * (2 * Math.PI);
      const dx = radiusMeters * Math.cos(angle);
      const dy = radiusMeters * Math.sin(angle);

      const dLat = dy / 111320;
      const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));

      coords.push([lng + dLng, lat + dLat]);
    }

    return coords;
  }

  private hexToRgb(hexColor: string): [number, number, number] {
    const normalized = hexColor.replace('#', '').trim();
    const shortHex = normalized.length === 3;

    if (![3, 6].includes(normalized.length)) {
      return [99, 102, 241];
    }

    const full = shortHex
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;

    const value = Number.parseInt(full, 16);
    if (Number.isNaN(value)) {
      return [99, 102, 241];
    }

    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  private async handleMarkerDragEnd(): Promise<void> {
    const lngLat = this.marker.getLngLat();
    const clamped = clampToSwitzerland(lngLat.lng, lngLat.lat);
    this.marker.setLngLat([clamped.lng, clamped.lat]);

    this.reverseAbort?.abort();
    const abort = new AbortController();
    this.reverseAbort = abort;

    try {
      const locality = await this.reverseGeocodeLocality(clamped.lat, clamped.lng, abort);
      if (this.reverseAbort !== abort) {
        return;
      }
      this.locationService.setLocation(clamped.lat, clamped.lng, '', locality ?? undefined);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      this.locationService.setLocation(clamped.lat, clamped.lng, '');
    } finally {
      if (this.reverseAbort === abort) {
        this.reverseAbort = null;
      }
    }
  }

  private async applyReverseAutoName(lat: number, lng: number): Promise<void> {
    this.reverseAbort?.abort();
    const abort = new AbortController();
    this.reverseAbort = abort;
    try {
      const locality = await this.reverseGeocodeLocality(lat, lng, abort);
      if (this.reverseAbort !== abort || !locality) {
        return;
      }
      this.locationService.setLocation(lat, lng, undefined, locality);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.warn('Initial reverse geocoding failed:', error);
      }
    } finally {
      if (this.reverseAbort === abort) {
        this.reverseAbort = null;
      }
    }
  }

  private async reverseGeocodeLocality(
    lat: number,
    lng: number,
    abort: AbortController,
  ): Promise<string | null> {
    const reverse = await this.geocodingService.reverseGeocode(lat, lng, abort.signal);
    return reverse?.locality ?? null;
  }
}
