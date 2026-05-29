import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MapComponent } from '../../components/map/map.component';
import { ZARR_LAYER_DEFINITIONS, type ZarrLayerDefinition } from '../../config/zarr-layers.config';
import { OnboardingPreferencesService } from '../../services/onboarding-preferences.service';
import { TinderPreferencesService } from '../../services/tinder-preferences.service';
import { MapPanelsService } from '../../services/map-panels.service';
import type { TinderRating } from '../../utils/tinder-inference.util';
import {
  normalizationBoundsForLayer,
  normalizedRawPercent,
} from '../../utils/preference-scoring.util';

type RatingTone =
  | 'strong-negative'
  | 'mild-negative'
  | 'neutral'
  | 'mild-positive'
  | 'strong-positive';

interface RatingOption {
  value: TinderRating;
  labelKey: string;
  tone: RatingTone;
}

interface RadarAxis {
  id: string;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  textAnchor: 'start' | 'middle' | 'end';
  labelKey: string;
  layer: ZarrLayerDefinition;
  percent: number;
}

const RADAR_PADDING = 52;
const RADAR_DRAW_SIZE = 280;
const RADAR_VIEW_SIZE = RADAR_DRAW_SIZE + RADAR_PADDING * 2;
const RADAR_CENTER = RADAR_PADDING + RADAR_DRAW_SIZE / 2;
const RADAR_RADIUS = 100;
const RADAR_RINGS = [20, 40, 60, 80, 100];

interface TinderRadarTooltip {
  title: string;
  percent: string;
  leftPct: number;
  topPct: number;
}

@Component({
  selector: 'app-tinder-preferences-page',
  standalone: true,
  imports: [TranslatePipe, RouterLink, MapComponent],
  templateUrl: './tinder-preferences.page.html',
  styleUrl: './tinder-preferences.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TinderPreferencesPage {
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingPreferencesService);
  private readonly tinderPreferences = inject(TinderPreferencesService);
  private readonly mapPanels = inject(MapPanelsService);

  protected readonly places = this.tinderPreferences.featuredPlaces;
  protected readonly layerDefinitions = ZARR_LAYER_DEFINITIONS;
  protected readonly currentIndex = signal(0);
  protected readonly ratingsByPlaceId = signal<Record<string, TinderRating>>({});
  protected readonly samplesByPlaceId = signal<Record<string, Record<string, number | null>>>({});
  protected readonly loadingSamples = signal(true);
  protected readonly applyInProgress = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly autoAdvancing = signal(false);
  protected readonly animateStage = signal<'idle' | 'out' | 'in'>('idle');
  protected readonly radarTooltip = signal<TinderRadarTooltip | null>(null);
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly ratingOptions: readonly RatingOption[] = [
    { value: -2, labelKey: 'tinder.rating.definitelyNot', tone: 'strong-negative' },
    { value: -1, labelKey: 'tinder.rating.no', tone: 'mild-negative' },
    { value: 0, labelKey: 'tinder.rating.neutral', tone: 'neutral' },
    { value: 1, labelKey: 'tinder.rating.yes', tone: 'mild-positive' },
    { value: 2, labelKey: 'tinder.rating.forSure', tone: 'strong-positive' },
  ];

  protected readonly currentPlace = computed(() => this.places[this.currentIndex()] ?? null);
  protected readonly progressPercent = computed(() =>
    this.places.length === 0 ? 0 : ((this.currentIndex() + 1) / this.places.length) * 100,
  );
  protected readonly currentPlaceFactors = computed(() => {
    const place = this.currentPlace();
    if (!place) {
      return [];
    }
    const values = this.samplesByPlaceId()[place.id];
    return this.layerDefinitions.map((layer) => ({
      layer,
      value: values?.[layer.id] ?? null,
    }));
  });
  protected readonly currentPlaceRadarPercentages = computed(() =>
    this.currentPlaceFactors().map((factor) => ({
      layer: factor.layer,
      value: factor.value,
      percent: this.normalizedFactorPercent(factor.layer, factor.value),
    })),
  );
  protected readonly radarViewSize = RADAR_VIEW_SIZE;
  protected readonly radarCenter = RADAR_CENTER;
  protected readonly radarRings = RADAR_RINGS;
  protected readonly radarAxes = computed(() => {
    const factors = this.currentPlaceRadarPercentages();
    const count = factors.length;
    if (count < 3) {
      return [] as RadarAxis[];
    }
    return factors.map((factor, index) => {
      const endpoint = this.polarToCartesian(RADAR_RADIUS, index, count);
      const labelPoint = this.polarToCartesian(RADAR_RADIUS + 22, index, count);
      return {
        id: factor.layer.id,
        x2: endpoint.x,
        y2: endpoint.y,
        labelX: labelPoint.x,
        labelY: labelPoint.y,
        textAnchor:
          labelPoint.x < RADAR_CENTER - 6 ? 'end' : labelPoint.x > RADAR_CENTER + 6 ? 'start' : 'middle',
        labelKey: factor.layer.labelKey,
        layer: factor.layer,
        percent: factor.percent,
      };
    });
  });
  protected readonly radarGridPolygons = computed(() => {
    const count = this.currentPlaceFactors().length;
    if (count < 3) {
      return [] as { level: number; points: string }[];
    }
    return RADAR_RINGS.map((level) => ({
      level,
      points: this.radarPolygonPoints((level / 100) * RADAR_RADIUS, count),
    }));
  });
  protected readonly radarDataPolygon = computed(() => {
    const factors = this.currentPlaceRadarPercentages();
    const count = factors.length;
    if (count < 3) {
      return '';
    }
    return this.radarDataPoints()
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
  });
  protected readonly radarDataPoints = computed(() => {
    const factors = this.currentPlaceRadarPercentages();
    const count = factors.length;
    if (count < 3) {
      return [] as Array<{
        layer: ZarrLayerDefinition;
        value: number | null;
        percent: number;
        x: number;
        y: number;
      }>;
    }
    return factors.map((factor, index) => {
      const point = this.polarToCartesian((factor.percent / 100) * RADAR_RADIUS, index, count);
      return {
        layer: factor.layer,
        value: factor.value,
        percent: factor.percent,
        x: point.x,
        y: point.y,
      };
    });
  });
  protected readonly isLastPlace = computed(() => this.currentIndex() >= this.places.length - 1);

  constructor() {
    this.onboarding.markPromptSeen();
    void this.loadSamples();
  }

  protected selectedRating(placeId: string): TinderRating | null {
    return this.ratingsByPlaceId()[placeId] ?? null;
  }

  protected setRating(rating: TinderRating): void {
    const place = this.currentPlace();
    if (!place) {
      return;
    }
    this.ratingsByPlaceId.update((prev) => ({ ...prev, [place.id]: rating }));
    this.queueAutoAdvance();
  }

  protected next(): void {
    if (this.currentIndex() >= this.places.length - 1) {
      return;
    }
    this.currentIndex.update((index) => index + 1);
  }

  protected back(): void {
    if (this.currentIndex() <= 0) {
      return;
    }
    this.hideRadarTooltip();
    this.currentIndex.update((index) => index - 1);
  }

  protected async finish(): Promise<void> {
    if (this.applyInProgress()) {
      return;
    }
    this.applyInProgress.set(true);
    try {
      const inferred = this.tinderPreferences.inferPreferences(
        this.ratingsByPlaceId(),
        this.samplesByPlaceId(),
      );
      this.tinderPreferences.applyPreferences(inferred);
      this.onboarding.markCompleted();
      await this.router.navigateByUrl('/');
      setTimeout(() => this.mapPanels.closeRightPanel(), 0);
    } finally {
      this.applyInProgress.set(false);
    }
  }

  protected formatFactorValue(layer: ZarrLayerDefinition, value: number | null): string {
    if (value === null) {
      return '—';
    }
    return layer.formatValue(value);
  }

  protected formatFactorPercent(value: number): string {
    return `${Math.round(value)}%`;
  }

  protected showRadarTooltip(
    layer: ZarrLayerDefinition,
    percent: number,
    event: MouseEvent,
  ): void {
    this.radarTooltip.set({
      title: this.translate.instant(layer.labelKey),
      percent: this.formatFactorPercent(percent),
      ...this.radarTooltipPositionFromEvent(event),
    });
  }

  protected moveRadarTooltip(event: MouseEvent): void {
    const current = this.radarTooltip();
    if (!current) {
      return;
    }
    this.radarTooltip.set({
      ...current,
      ...this.radarTooltipPositionFromEvent(event),
    });
  }

  protected hideRadarTooltip(): void {
    this.radarTooltip.set(null);
  }

  ngOnDestroy(): void {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  private async loadSamples(): Promise<void> {
    this.loadingSamples.set(true);
    this.loadError.set(null);
    try {
      await this.tinderPreferences.waitUntilLayersReady();
      const samples = await this.tinderPreferences.sampleFeaturedPlaces(this.places);
      this.samplesByPlaceId.set(samples);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : this.translate.instant('tinder.loadError');
      this.loadError.set(message);
    } finally {
      this.loadingSamples.set(false);
    }
  }

  private queueAutoAdvance(): void {
    if (this.isLastPlace()) {
      void this.finish();
      return;
    }
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
    }
    this.autoAdvancing.set(true);
    this.animateStage.set('out');
    this.hideRadarTooltip();
    this.autoAdvanceTimer = setTimeout(() => {
      this.currentIndex.update((index) => Math.min(index + 1, this.places.length - 1));
      this.animateStage.set('in');
      this.autoAdvanceTimer = setTimeout(() => {
        this.autoAdvancing.set(false);
        this.animateStage.set('idle');
        this.autoAdvanceTimer = null;
      }, 200);
    }, 220);
  }

  private normalizedFactorPercent(layer: ZarrLayerDefinition, raw: number | null): number {
    if (raw === null) {
      return 0;
    }
    const meta = this.tinderPreferences.layerMetaById()[layer.id] ?? null;
    const bounds = normalizationBoundsForLayer(layer.clim, layer.higherIsBetter, meta);
    return normalizedRawPercent(raw, bounds);
  }

  private radarPolygonPoints(radius: number, axisCount: number): string {
    return Array.from({ length: axisCount }, (_, index) => {
      const point = this.polarToCartesian(radius, index, axisCount);
      return `${point.x},${point.y}`;
    }).join(' ');
  }

  private polarToCartesian(radius: number, index: number, axisCount: number): { x: number; y: number } {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / axisCount;
    return {
      x: RADAR_CENTER + radius * Math.cos(angle),
      y: RADAR_CENTER + radius * Math.sin(angle),
    };
  }

  private radarTooltipPositionFromEvent(event: MouseEvent): { leftPct: number; topPct: number } {
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
}
