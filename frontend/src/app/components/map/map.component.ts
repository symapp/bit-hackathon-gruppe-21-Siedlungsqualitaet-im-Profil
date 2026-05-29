import { Component, OnInit, OnDestroy, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { LocationService, type RegionOfInterest } from '../../services/location.service';
import type { GroceryStore } from '../../services/overpass.service';
import { ZarrMapService } from '../../services/zarr-map.service';
import { exposeMapForE2e } from '../../testing/e2e-map.harness';
import { Map, NavigationControl, Marker } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, PolygonLayer } from '@deck.gl/layers';
import { clampToSwitzerland, SWITZERLAND_MAX_BOUNDS } from '../../config/map-bounds.config';

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
  private lastFlyToRegionKey: string | null = null;

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
  }

  ngOnDestroy(): void {
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
    const lat = activeRegion?.lat ?? 47.3769;
    const lng = activeRegion?.lng ?? 8.5417;
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
      const lngLat = this.marker.getLngLat();
      const clamped = clampToSwitzerland(lngLat.lng, lngLat.lat);
      this.marker.setLngLat([clamped.lng, clamped.lat]);
      this.locationService.setLocation(clamped.lat, clamped.lng, '');
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
      new ScatterplotLayer<GroceryStore>({
        id: 'grocery-store-points',
        data: groceryStores,
        getPosition: (store) => [store.lng, store.lat],
        getFillColor: [16, 185, 129, 220],
        getLineColor: [4, 120, 87, 255],
        getLineWidth: 2,
        getRadius: 7,
        lineWidthUnits: 'pixels',
        radiusUnits: 'pixels',
        filled: true,
        stroked: true,
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
}
