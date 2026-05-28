import { Component, inject } from '@angular/core';
import { LocationService } from '../../services/location.service';
import { FormsModule } from '@angular/forms';
import { ZARR_LAYER_DEFINITIONS } from '../../config/zarr-layers.config';
import type { LocationMetrics } from '../../models/metrics.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  protected locationService = inject(LocationService);
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

  onLayerToggle(layerId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.locationService.setZarrLayerVisible(layerId, checked);
  }
}
