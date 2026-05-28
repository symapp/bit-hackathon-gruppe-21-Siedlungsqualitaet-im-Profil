import { Component, OnInit, OnDestroy, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { LocationService } from '../../services/location.service';
import { Map, NavigationControl, Marker } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, PolygonLayer } from '@deck.gl/layers';

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss'
})
export class MapComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private map!: Map;
  private marker!: Marker;
  private deckOverlay!: MapboxOverlay;
  private locationService = inject(LocationService);

  constructor() {
    // React to location/radius changes and update deck.gl layers
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
    });

    // Add navigation controls
    this.map.addControl(new NavigationControl(), 'top-left');

    // Create draggable marker
    this.marker = new Marker({
      draggable: true,
      color: '#6366f1'
    })
      .setLngLat([lng, lat])
      .addTo(this.map);

    // Handle marker drag end
    this.marker.on('dragend', () => {
      const lngLat = this.marker.getLngLat();
      this.locationService.setLocation(lngLat.lat, lngLat.lng);
      this.locationService.setAddress('');
    });

    // Initialize Deck.gl overlay
    this.deckOverlay = new MapboxOverlay({
      interleaved: true,
      layers: []
    });

    this.map.addControl(this.deckOverlay as any);

    // Add deck.gl layers once map is loaded
    this.map.on('load', () => {
      this.updateDeckLayers(lat, lng, this.locationService.radius());
    });
  }

  private updateDeckLayers(lat: number, lng: number, radius: number): void {
    const circlePolygon = this.createCirclePolygon(lng, lat, radius);

    const layers = [
      // Filled circle layer
      new PolygonLayer({
        id: 'radius-circle-fill',
        data: [{ polygon: circlePolygon }],
        getPolygon: (d: any) => d.polygon,
        getFillColor: [99, 102, 241, 25], // Indigo with low opacity
        getLineColor: [99, 102, 241, 160], // Indigo border
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        filled: true,
        stroked: true,
        pickable: false,
      }),
      // Center point highlight
      new ScatterplotLayer({
        id: 'center-point',
        data: [{ position: [lng, lat] }],
        getPosition: (d: any) => d.position,
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

      // Convert meters to degrees
      const dLat = dy / 111320;
      const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));

      coords.push([lng + dLng, lat + dLat]);
    }

    return coords;
  }
}
