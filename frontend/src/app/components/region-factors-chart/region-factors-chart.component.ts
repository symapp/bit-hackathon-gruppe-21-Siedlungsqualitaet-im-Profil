import { Component, computed, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ZARR_LAYER_DEFINITIONS } from '../../config/zarr-layers.config';
import type { ZarrLayerDefinition } from '../../config/zarr-layers.config';
import { LocationService } from '../../services/location.service';
import {
  normalizationBoundsForLayer,
  normalizedRawPercent,
} from '../../utils/preference-scoring.util';

const VIEW_SIZE = 280;
const CX = VIEW_SIZE / 2;
const CY = VIEW_SIZE / 2;
const MAX_R = 96;
const GRID_LEVELS = [20, 40, 60, 80, 100];
const MIN_RADAR_FACTORS = 3;

export interface RadarAxis {
  layerId: string;
  labelKey: string;
  labelX: number;
  labelY: number;
  lineX2: number;
  lineY2: number;
  textAnchor: 'start' | 'middle' | 'end';
}

export interface RadarGridRing {
  level: number;
  points: string;
}

export interface RadarRegionSeries {
  regionId: string;
  name: string;
  color: string;
  polygonPoints: string;
  dots: {
    x: number;
    y: number;
    rawValue: number | null;
    percent: number;
    labelKey: string;
    metricUnitKey: string;
    def: ZarrLayerDefinition;
  }[];
}

interface SelectedFactor {
  def: ZarrLayerDefinition;
  layerId: string;
  labelKey: string;
}

interface RadarTooltipState {
  title: string;
  entries: RadarTooltipEntry[];
  leftPct: number;
  topPct: number;
}

interface RadarTooltipEntry {
  regionName: string;
  regionColor: string;
  value: string;
  percent: string;
}

@Component({
  selector: 'app-region-factors-chart',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './region-factors-chart.component.html',
  styleUrl: './region-factors-chart.component.scss',
})
export class RegionFactorsChartComponent {
  protected readonly locationService = inject(LocationService);
  private readonly translate = inject(TranslateService);
  protected readonly viewSize = VIEW_SIZE;
  protected readonly cx = CX;
  protected readonly cy = CY;
  protected tooltip: RadarTooltipState | null = null;

  protected readonly selectedFactors = computed((): SelectedFactor[] => {
    const layers = this.locationService.zarrLayers();

    return ZARR_LAYER_DEFINITIONS.flatMap((def) => {
      const layer = layers.find((l) => l.id === def.id);
      if (!layer?.enabled || layer.preference.importance <= 0) {
        return [];
      }
      return [{ def, layerId: def.id, labelKey: def.labelKey }];
    });
  });

  protected readonly hasSelectedFactors = computed(() => this.selectedFactors().length > 0);
  protected readonly canShowRadar = computed(
    () => this.selectedFactors().length >= MIN_RADAR_FACTORS,
  );

  protected readonly gridRings = computed((): RadarGridRing[] => {
    const n = this.selectedFactors().length;
    if (n < MIN_RADAR_FACTORS) {
      return [];
    }

    return GRID_LEVELS.map((level) => ({
      level,
      points: this.polygonPointsForRadius((level / 100) * MAX_R, n),
    }));
  });

  protected readonly axes = computed((): RadarAxis[] => {
    const factors = this.selectedFactors();
    const n = factors.length;
    if (n < MIN_RADAR_FACTORS) {
      return [];
    }

    return factors.map((factor, index) => {
      const { x, y } = this.polarToCartesian(MAX_R + 14, index, n);
      const spoke = this.polarToCartesian(MAX_R, index, n);
      const textAnchor: 'start' | 'middle' | 'end' =
        x < CX - 4 ? 'end' : x > CX + 4 ? 'start' : 'middle';

      return {
        layerId: factor.layerId,
        labelKey: factor.labelKey,
        labelX: x,
        labelY: y,
        lineX2: spoke.x,
        lineY2: spoke.y,
        textAnchor,
      };
    });
  });

  protected readonly regionSeries = computed((): RadarRegionSeries[] => {
    const factors = this.selectedFactors();
    const n = factors.length;
    if (n < MIN_RADAR_FACTORS) {
      return [];
    }

    const layers = this.locationService.zarrLayers();
    const metricsByRegion = this.locationService.regionMetrics();

    return this.locationService.regions().map((region) => {
      const metrics = metricsByRegion[region.id] ?? null;
      const normalizedFactors = factors.map((factor) => {
        const layer = layers.find((l) => l.id === factor.layerId);
        if (!layer || !metrics) {
          return {
            rawValue: null,
            percent: 0,
            labelKey: factor.labelKey,
            metricUnitKey: factor.def.metricUnitKey,
            def: factor.def,
          };
        }
        const raw = metrics[factor.def.metricKey];
        if (raw === null) {
          return {
            rawValue: null,
            percent: 0,
            labelKey: factor.labelKey,
            metricUnitKey: factor.def.metricUnitKey,
            def: factor.def,
          };
        }
        const bounds = normalizationBoundsForLayer(
          factor.def.clim,
          factor.def.higherIsBetter,
          layer.meta,
        );
        return {
          rawValue: raw,
          percent: normalizedRawPercent(raw, bounds),
          labelKey: factor.labelKey,
          metricUnitKey: factor.def.metricUnitKey,
          def: factor.def,
        };
      });

      const dots = normalizedFactors.map((factor, index) => {
        const point = this.polarToCartesian((factor.percent / 100) * MAX_R, index, n);
        return {
          ...point,
          rawValue: factor.rawValue,
          percent: factor.percent,
          labelKey: factor.labelKey,
          metricUnitKey: factor.metricUnitKey,
          def: factor.def,
        };
      });

      return {
        regionId: region.id,
        name: region.name,
        color: region.color,
        polygonPoints: dots.map((p) => `${p.x},${p.y}`).join(' '),
        dots,
      };
    });
  });

  protected formatRawValue(def: ZarrLayerDefinition, value: number | null): string {
    if (value === null) {
      return '—';
    }
    return def.formatValue(value);
  }

  protected formatPercent(value: number): string {
    return `${Math.round(value)}%`;
  }

  private factorTooltipEntry(
    series: RadarRegionSeries,
    dot: RadarRegionSeries['dots'][number],
  ): RadarTooltipEntry {
    const value = this.formatRawValue(dot.def, dot.rawValue);
    const unit = dot.rawValue !== null ? ` ${this.translate.instant(dot.metricUnitKey)}` : '';
    return {
      regionName: series.name,
      regionColor: series.color,
      value: `${value}${unit}`,
      percent: this.formatPercent(dot.percent),
    };
  }

  protected showFactorTooltipByIndex(factorIndex: number, event: MouseEvent): void {
    const factors = this.selectedFactors();
    const factor = factors[factorIndex];
    if (!factor) {
      return;
    }
    const entries = this.regionSeries()
      .map((series) => {
        const dot = series.dots[factorIndex];
        if (!dot) {
          return null;
        }
        return this.factorTooltipEntry(series, dot);
      })
      .filter((entry): entry is RadarTooltipEntry => entry !== null);
    this.tooltip = {
      title: this.translate.instant(factor.labelKey),
      entries,
      ...this.tooltipPositionFromEvent(event),
    };
  }

  protected showFactorTooltipByLayerId(layerId: string, event: MouseEvent): void {
    const factorIndex = this.selectedFactors().findIndex((factor) => factor.layerId === layerId);
    if (factorIndex < 0) {
      return;
    }
    this.showFactorTooltipByIndex(factorIndex, event);
  }

  protected moveTooltip(event: MouseEvent): void {
    if (!this.tooltip) {
      return;
    }
    this.tooltip = {
      ...this.tooltip,
      ...this.tooltipPositionFromEvent(event),
    };
  }

  protected hideTooltip(): void {
    this.tooltip = null;
  }

  private tooltipPositionFromEvent(event: MouseEvent): { leftPct: number; topPct: number } {
    const target = event.currentTarget as SVGGraphicsElement | null;
    const svg = target?.ownerSVGElement;
    if (!svg) {
      return { leftPct: 50, topPct: 50 };
    }
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    return {
      leftPct: Math.min(92, Math.max(8, x)),
      topPct: Math.min(92, Math.max(8, y)),
    };
  }

  private polygonPointsForRadius(radius: number, axisCount: number): string {
    return Array.from({ length: axisCount }, (_, index) => {
      const { x, y } = this.polarToCartesian(radius, index, axisCount);
      return `${x},${y}`;
    }).join(' ');
  }

  private polarToCartesian(
    radius: number,
    index: number,
    axisCount: number,
  ): { x: number; y: number } {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / axisCount;
    return {
      x: CX + radius * Math.cos(angle),
      y: CY + radius * Math.sin(angle),
    };
  }
}
