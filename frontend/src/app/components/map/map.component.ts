import { Component, OnInit, OnDestroy, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LocationService, type RegionOfInterest } from '../../services/location.service';
import { getAmenityIcon, type NearbyAmenity } from '../../services/overpass.service';
import { ZarrMapService } from '../../services/zarr-map.service';
import { GeocodingService } from '../../services/geocoding.service';
import { exposeMapForE2e } from '../../testing/e2e-map.harness';
import { Map, NavigationControl, Marker, type MapMouseEvent } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, PolygonLayer, IconLayer } from '@deck.gl/layers';

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
  private readonly translate = inject(TranslateService);
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
      const amenities = this.locationService.allAmenities();

      if (this.map && this.marker && this.deckOverlay) {
        this.updateDeckLayers(regions, activeRegion?.id ?? '', amenities);

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

    this.map.on('click', (event: MapMouseEvent) => {
      if (!this.locationService.activeRegion()) {
        return;
      }
      void this.moveActiveRegionTo(event.lngLat.lng, event.lngLat.lat);
    });

    this.deckOverlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      getTooltip: (info) => {
        if (!info.object || !info.layer || info.layer.id !== 'amenity-icons') {
          return null;
        }
        const amenity = info.object as NearbyAmenity;
        const address =
          amenity.address || this.translate.instant('regions.noAddress');
        const distance = this.translate.instant('regions.distanceAway', {
          distance: Math.round(amenity.distanceMeters),
        });
        return {
          html: `
            <div style="padding: 8px; font-family: sans-serif; font-size: 12px; line-height: 1.4;">
              <div style="font-weight: 700; color: #111; margin-bottom: 2px;">${amenity.name}</div>
              <div style="color: #666; margin-bottom: 4px;">${address}</div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #eee; padding-top: 4px; margin-top: 4px;">
                <span style="background: #f0f0f0; padding: 2px 6px; border-radius: 2px; text-transform: capitalize;">${amenity.type}</span>
                <span style="font-weight: 600; color: #d8232a;">${distance}</span>
              </div>
            </div>
          `,
          style: {
            backgroundColor: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            borderRadius: '4px',
            color: '#000',
            border: '1px solid #ddd'
          }
        };
      }
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
        this.locationService.amenities(),
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

    for (const selector of [
      '.regions-sidebar',
      '.sidebar',
      '.search-container',
      '.mobile-map-toolbar',
    ]) {
      observe(selector);
    }
    resizeObserver.observe(document.body);

    const mutationObserver = new MutationObserver(() => {
      for (const selector of [
        '.regions-sidebar',
        '.sidebar',
        '.search-container',
        '.mobile-map-toolbar',
      ]) {
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
    const mainLayout = document.querySelector('.main-layout');
    if (mainLayout) {
      mutationObserver.observe(mainLayout, { childList: true });
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
    amenities: NearbyAmenity[],
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
      new IconLayer<NearbyAmenity>({
        id: 'amenity-icons',
        data: amenities,
        getPosition: (amenity) => [amenity.lng, amenity.lat],
        getIcon: (amenity) => ({
          url: getAmenityIcon(amenity.type),
          width: 128,
          height: 128,
          mask: true,
        }),
        getSize: 50,
        getColor: [216, 35, 42, 255],
        sizeUnits: 'pixels',
        pickable: true,
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
    await this.moveActiveRegionTo(lngLat.lng, lngLat.lat);
  }

  private async moveActiveRegionTo(lng: number, lat: number): Promise<void> {
    const clamped = clampToSwitzerland(lng, lat);
    this.marker.setLngLat([clamped.lng, clamped.lat]);
    this.locationService.setLocation(clamped.lat, clamped.lng);

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
