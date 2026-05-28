import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { LocationService } from '../../services/location.service';
import { ZarrMapService } from '../../services/zarr-map.service';
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

  constructor() {
    effect(() => {
      const lat = this.locationService.lat();
      const lng = this.locationService.lng();
      const radius = this.locationService.radius();

      if (this.map && this.marker && this.deckOverlay) {
        this.marker.setLngLat([lng, lat]);
        this.updateDeckLayers(lat, lng, radius);
        this.map.flyTo({ center: [lng, lat], essential: true });
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
    const lat = this.locationService.lat();
    const lng = this.locationService.lng();

    this.map = new Map({
      container: this.mapContainer.nativeElement,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [lng, lat],
      zoom: 14,
      maxBounds: SWITZERLAND_MAX_BOUNDS,
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
    this.zarrMapService.attachToMap(this.map);

    this.map.on('load', () => {
      this.updateDeckLayers(lat, lng, this.locationService.radius());
    });
  }

  private updateDeckLayers(lat: number, lng: number, radius: number): void {
    const circlePolygon = this.createCirclePolygon(lng, lat, radius);

    const layers = [
      new PolygonLayer({
        id: 'radius-circle-fill',
        data: [{ polygon: circlePolygon }],
        getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
        getFillColor: [99, 102, 241, 25],
        getLineColor: [99, 102, 241, 160],
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        filled: true,
        stroked: true,
        pickable: false,
      }),
      new ScatterplotLayer({
        id: 'center-point',
        data: [{ position: [lng, lat] }],
        getPosition: (d: { position: [number, number] }) => d.position,
        getFillColor: [99, 102, 241, 200],
        getRadius: 8,
        radiusUnits: 'pixels',
        filled: true,
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
}
