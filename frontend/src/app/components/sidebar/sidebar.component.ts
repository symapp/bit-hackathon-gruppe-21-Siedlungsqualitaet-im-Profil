import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ZARR_LAYER_DEFINITIONS, type ZarrLayerDefinition } from '../../config/zarr-layers.config';
import type { LocationMetrics } from '../../models/metrics.model';
import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  protected readonly locationService = inject(LocationService);
  protected isCollapsed = false;
  protected readonly metricDefinitions = ZARR_LAYER_DEFINITIONS;

  protected get radiusValue(): number {
    return this.locationService.radius();
  }

  protected set radiusValue(value: number) {
    this.locationService.setRadius(value);
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  formatRadius(value: number): string {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)} km`;
    }
    return `${value} m`;
  }

  formatMetricValue(key: keyof LocationMetrics): string {
    const value = this.locationService.metrics()[key];
    const definition = this.metricDefinitions.find((d) => d.metricKey === key);
    if (value === null || value === undefined) {
      return '—';
    }
    return definition?.formatValue(value) ?? String(value);
  }

  formatClim(clim: [number, number], layerId: string): string {
    const def = this.metricDefinitions.find((d) => d.id === layerId);
    if (!def) {
      return `${clim[0]} – ${clim[1]}`;
    }
    return `${def.formatValue(clim[0])} – ${def.formatValue(clim[1])}`;
  }

  legendGradient(colors: string[]): string {
    return `linear-gradient(to right, ${colors.join(', ')})`;
  }

  layerDefinition(layerId: string): ZarrLayerDefinition | undefined {
    return this.metricDefinitions.find((d) => d.id === layerId);
  }

  onLayerWeightChange(layerId: string, weight: number): void {
    this.locationService.setZarrLayerWeight(layerId, weight);
  }

  onLayerEnabledChange(layerId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.locationService.setZarrLayerEnabled(layerId, input.checked);
  }
}
