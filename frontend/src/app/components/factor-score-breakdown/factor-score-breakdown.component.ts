import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ZARR_LAYER_DEFINITIONS } from '../../config/zarr-layers.config';
import { LocationService } from '../../services/location.service';
import {
  factorScoreFromRaw,
  normalizeToPreferenceScale,
  normalizationBoundsForLayer,
} from '../../utils/preference-scoring.util';

export interface FactorBreakdownRow {
  layerId: string;
  labelKey: string;
  score: number;
  importance: number;
  t: number;
  rawLabel: string;
}

@Component({
  selector: 'app-factor-score-breakdown',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './factor-score-breakdown.component.html',
  styleUrl: './factor-score-breakdown.component.scss',
})
export class FactorScoreBreakdownComponent {
  readonly regionId = input.required<string>();

  private readonly locationService = inject(LocationService);
  private readonly translate = inject(TranslateService);

  protected readonly expanded = signal(false);

  protected readonly rows = computed((): FactorBreakdownRow[] => {
    const regionId = this.regionId();
    const metrics = this.locationService.regionMetrics()[regionId];
    if (!metrics) {
      return [];
    }

    const layers = this.locationService.zarrLayers();
    const result: FactorBreakdownRow[] = [];

    for (const def of ZARR_LAYER_DEFINITIONS) {
      const layer = layers.find((l) => l.id === def.id);
      if (!layer?.enabled || layer.preference.importance <= 0) {
        continue;
      }
      const raw = metrics[def.metricKey];
      if (raw === null) {
        continue;
      }
      const bounds = normalizationBoundsForLayer(def.clim, def.higherIsBetter, layer.meta);
      const t = normalizeToPreferenceScale(raw, bounds);
      const score = factorScoreFromRaw(raw, bounds, layer.preference);
      const unit = this.translate.instant(def.metricUnitKey);
      result.push({
        layerId: def.id,
        labelKey: def.labelKey,
        score,
        importance: layer.preference.importance,
        t,
        rawLabel: `${def.formatValue(raw)} ${unit}`.trim(),
      });
    }

    return result.sort((a, b) => b.importance - a.importance || b.score - a.score);
  });

  protected readonly overviewScore = computed(() => {
    return this.locationService.regionOverviewScores()[this.regionId()] ?? null;
  });

  protected readonly hasRows = computed(() => this.rows().length > 0);

  protected toggleExpanded(event: Event): void {
    event.stopPropagation();
    this.expanded.update((v) => !v);
  }

  protected barWidth(score: number): string {
    return `${Math.min(100, Math.max(0, score))}%`;
  }
}
