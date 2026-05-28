import {
  Component,
  ElementRef,
  ViewChild,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import type { LayerPreference } from '../../models/layer-preference.model';
import type { NormalizationBounds } from '../../utils/preference-scoring.util';
import {
  clampLayerPreference,
  factorScoreFromT,
  handlesFromPreference,
  normalizeToPreferenceScale,
  preferenceFromHandles,
  preferenceScaleToRaw,
} from '../../utils/preference-scoring.util';

type DragHandle = 'plateauLeft' | 'plateauRight' | 'leftZero' | 'rightZero';

const W = 280;
const H = 120;

@Component({
  selector: 'app-trapezoid-preference-editor',
  standalone: true,
  templateUrl: './trapezoid-preference-editor.component.html',
  styleUrl: './trapezoid-preference-editor.component.scss',
})
export class TrapezoidPreferenceEditorComponent {
  protected readonly PAD = { left: 44, right: 12, top: 12, bottom: 28 };

  readonly preference = input.required<LayerPreference>();
  readonly bounds = input.required<NormalizationBounds>();
  readonly sampleRaw = input<number | null>(null);
  readonly disabled = input(false);
  readonly formatRaw = input<(v: number) => string>((v) => v.toFixed(2));
  readonly unit = input('');

  readonly preferenceChange = output<LayerPreference>();

  @ViewChild('svgRoot', { static: true }) svgRoot!: ElementRef<SVGSVGElement>;

  readonly viewWidth = W;
  readonly viewHeight = H;

  private dragging: DragHandle | null = null;

  readonly handles = signal({
    plateauLeft: 0.35,
    plateauRight: 0.65,
    leftZero: 0.25,
    rightZero: 0.75,
  });

  constructor() {
    effect(() => {
      const pref = this.preference();
      this.handles.set(handlesFromPreference(pref));
    });
  }

  onPointerDown(handle: DragHandle, event: PointerEvent): void {
    if (this.disabled()) {
      return;
    }
    event.preventDefault();
    this.dragging = handle;
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    const pt = this.clientToChart(event.clientX, event.clientY);
    const h = { ...this.handles() };

    switch (this.dragging) {
      case 'plateauLeft':
        h.plateauLeft = Math.min(pt.t, h.plateauRight - 0.02);
        h.leftZero = Math.min(h.leftZero, h.plateauLeft);
        break;
      case 'plateauRight':
        h.plateauRight = Math.max(pt.t, h.plateauLeft + 0.02);
        h.rightZero = Math.max(h.rightZero, h.plateauRight);
        break;
      case 'leftZero':
        h.leftZero = Math.min(pt.t, h.plateauLeft);
        break;
      case 'rightZero':
        h.rightZero = Math.max(pt.t, h.plateauRight);
        break;
    }

    h.leftZero = Math.max(0, h.leftZero);
    h.rightZero = Math.min(1, h.rightZero);

    this.handles.set(h);
    const updated = preferenceFromHandles(
      h.plateauLeft,
      h.plateauRight,
      h.leftZero,
      h.rightZero,
    );
    const current = this.preference();
    this.preferenceChange.emit(
      clampLayerPreference({
        ...current,
        rangeMin: updated.rangeMin,
        rangeMax: updated.rangeMax,
        falloffLeft: updated.falloffLeft,
        falloffRight: updated.falloffRight,
      }),
    );
  }

  onPointerUp(event: PointerEvent): void {
    if (this.dragging) {
      (event.target as Element).releasePointerCapture(event.pointerId);
      this.dragging = null;
    }
  }

  chartPoints(): string {
    const h = this.handles();
    const pts = [
      this.toSvg(0, 0),
      this.toSvg(h.leftZero, 0),
      this.toSvg(h.plateauLeft, 1),
      this.toSvg(h.plateauRight, 1),
      this.toSvg(h.rightZero, 0),
      this.toSvg(1, 0),
    ];
    return pts.map((p) => `${p.x},${p.y}`).join(' ');
  }

  handlePos(handle: DragHandle): { x: number; y: number } {
    const h = this.handles();
    switch (handle) {
      case 'plateauLeft':
        return this.toSvg(h.plateauLeft, 1);
      case 'plateauRight':
        return this.toSvg(h.plateauRight, 1);
      case 'leftZero':
        return this.toSvg(h.leftZero, 0);
      case 'rightZero':
        return this.toSvg(h.rightZero, 0);
    }
  }

  sampleMarker(): { x: number; y: number } | null {
    const raw = this.sampleRaw();
    if (raw === null) {
      return null;
    }
    const t = normalizeToPreferenceScale(raw, this.bounds());
    const pref = this.preference();
    const factor = factorScoreFromT(t, pref) / 100;
    return this.toSvg(t, factor);
  }

  tickLabels(): { t: number; label: string; x: number }[] {
    return [0, 0.5, 1].map((t) => ({
      t,
      label: this.formatAxisTick(t),
      x: this.toSvg(t, 0).x,
    }));
  }

  /** Raw metric value at t with correct unit (not “Score”). */
  formatAxisTick(t: number): string {
    const raw = preferenceScaleToRaw(t, this.bounds());
    const formatted = this.formatRaw()(raw);
    const u = this.unit().trim();
    if (!u) {
      return formatted;
    }
    if (u === '%') {
      return `${formatted}\u00a0%`;
    }
    return `${formatted}\u00a0${u}`;
  }

  axisCaption(): string {
    const b = this.bounds();
    const left = this.formatAxisTick(0);
    const right = this.formatAxisTick(1);
    if (b.higherIsBetter) {
      return `← ${left} (schlechter) · ${right} (besser) →`;
    }
    return `← ${left} (besser) · ${right} (schlechter) →`;
  }

  protected handleKeys(): DragHandle[] {
    return ['plateauLeft', 'plateauRight', 'leftZero', 'rightZero'];
  }

  private toSvg(t: number, factor: number): { x: number; y: number } {
    const innerW = W - this.PAD.left - this.PAD.right;
    const innerH = H - this.PAD.top - this.PAD.bottom;
    return {
      x: this.PAD.left + t * innerW,
      y: this.PAD.top + (1 - factor) * innerH,
    };
  }

  private clientToChart(clientX: number, clientY: number): { t: number; factor: number } {
    const rect = this.svgRoot.nativeElement.getBoundingClientRect();
    const innerW = W - this.PAD.left - this.PAD.right;
    const innerH = H - this.PAD.top - this.PAD.bottom;
    const x = ((clientX - rect.left) / rect.width) * W - this.PAD.left;
    const y = ((clientY - rect.top) / rect.height) * H - this.PAD.top;
    return {
      t: Math.min(1, Math.max(0, x / innerW)),
      factor: Math.min(1, Math.max(0, 1 - y / innerH)),
    };
  }
}
