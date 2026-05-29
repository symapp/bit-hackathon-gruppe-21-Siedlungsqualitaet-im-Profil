import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
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
  dots: { x: number; y: number }[];
}

interface SelectedFactor {
  def: ZarrLayerDefinition;
  layerId: string;
  labelKey: string;
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
  protected readonly viewSize = VIEW_SIZE;
  protected readonly cx = CX;
  protected readonly cy = CY;

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
      const radii = factors.map((factor) => {
        const layer = layers.find((l) => l.id === factor.layerId);
        if (!layer || !metrics) {
          return 0;
        }
        const raw = metrics[factor.def.metricKey];
        if (raw === null) {
          return 0;
        }
        const bounds = normalizationBoundsForLayer(
          factor.def.clim,
          factor.def.higherIsBetter,
          layer.meta,
        );
        return normalizedRawPercent(raw, bounds);
      });

      const dots = radii.map((radius, index) =>
        this.polarToCartesian((radius / 100) * MAX_R, index, n),
      );

      return {
        regionId: region.id,
        name: region.name,
        color: region.color,
        polygonPoints: dots.map((p) => `${p.x},${p.y}`).join(' '),
        dots,
      };
    });
  });

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
