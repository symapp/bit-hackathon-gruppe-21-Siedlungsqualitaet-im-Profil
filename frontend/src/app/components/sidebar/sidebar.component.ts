import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import {
  OVERVIEW_COLORMAP,
  ZARR_LAYER_DEFINITIONS,
  type ZarrLayerDefinition,
} from '../../config/zarr-layers.config';
import type { LayerPreference } from '../../models/layer-preference.model';
import type { LocationMetrics } from '../../models/metrics.model';
import { LocationService } from '../../services/location.service';
import type { GroceryStore } from '../../services/overpass.service';
import { climToNormalizationBounds, metaToNormalizationBounds } from '../../utils/preference-scoring.util';
import { TrapezoidPreferenceEditorComponent } from '../trapezoid-preference-editor/trapezoid-preference-editor.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [FormsModule, TranslatePipe, LanguageSelectorComponent, TrapezoidPreferenceEditorComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  protected readonly locationService = inject(LocationService);
  private readonly translate = inject(TranslateService);
  protected isCollapsed = false;
  protected readonly metricDefinitions = ZARR_LAYER_DEFINITIONS;

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  formatStoreDistance(store: GroceryStore): string {
    if (store.distanceMeters >= 1000) {
      return `${(store.distanceMeters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(store.distanceMeters)} m`;
  }

  formatStoreLocation(store: GroceryStore): string {
    return store.address || `${store.lat.toFixed(5)}, ${store.lng.toFixed(5)}`;
  }

  formatMetricValue(key: keyof LocationMetrics): string {
    const value = this.locationService.metrics()[key];
    const definition = this.metricDefinitions.find((d) => d.metricKey === key);
    if (value === null || value === undefined) {
      return '—';
    }
    return definition?.formatValue(value) ?? String(value);
  }

  metricUnit(def: ZarrLayerDefinition): string {
    return this.translate.instant(def.metricUnitKey);
  }

  legendGradient(colors: readonly string[] | string[]): string {
    return `linear-gradient(to right, ${colors.join(', ')})`;
  }

  overviewLegendGradient(): string {
    return this.legendGradient([...OVERVIEW_COLORMAP]);
  }

  layerDefinition(layerId: string): ZarrLayerDefinition | undefined {
    return this.metricDefinitions.find((d) => d.id === layerId);
  }

  normalizationBounds(layerId: string) {
    const layer = this.locationService.zarrLayers().find((l) => l.id === layerId);
    const def = this.layerDefinition(layerId);
    if (!def) {
      return { p5: 0, p95: 1, higherIsBetter: true };
    }
    if (layer?.meta) {
      return metaToNormalizationBounds(layer.meta);
    }
    return climToNormalizationBounds(def.clim, def.higherIsBetter);
  }

  sampleRawForLayer(layerId: string): number | null {
    const def = this.layerDefinition(layerId);
    if (!def) {
      return null;
    }
    return this.locationService.metrics()[def.metricKey];
  }

  onPreferenceChange(layerId: string, preference: LayerPreference): void {
    this.locationService.setZarrLayerPreference(layerId, preference);
  }

  onImportanceChange(layerId: string, importance: number): void {
    const layer = this.locationService.zarrLayers().find((l) => l.id === layerId);
    if (!layer) {
      return;
    }
    this.locationService.setZarrLayerPreference(layerId, {
      ...layer.preference,
      importance,
    });
  }

  onLayerEnabledChange(layerId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.locationService.setZarrLayerEnabled(layerId, input.checked);
  }

  onGroceryStoresEnabledChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.locationService.setGroceryStoresEnabled(input.checked);
  }

  resetLayerPreference(layerId: string): void {
    this.locationService.resetZarrLayerPreference(layerId);
  }

  resetAllPreferences(): void {
    this.locationService.resetAllZarrPreferences();
  }

  deselectAllLayers(): void {
    this.locationService.setAllZarrLayersEnabled(false);
  }

  isAnyLayerEnabled(): boolean {
    return this.locationService.zarrLayers().some((layer) => layer.enabled);
  }
}
