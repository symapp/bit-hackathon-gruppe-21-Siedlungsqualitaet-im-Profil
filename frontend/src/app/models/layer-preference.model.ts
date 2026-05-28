/** User preference for one settlement-quality factor (trapezoid on t ∈ [0, 1]). */
export interface LayerPreference {
  enabled: boolean;
  /** Weight in weighted mean of factor scores (0–100). */
  importance: number;
  /** Plateau start on preference scale t (left side of chart = lower t). */
  rangeMin: number;
  /** Plateau end on preference scale t (right side = higher t). */
  rangeMax: number;
  /** Linear falloff width left of the plateau (on t scale). */
  falloffLeft: number;
  /** Linear falloff width right of the plateau (on t scale). */
  falloffRight: number;
}

export interface TrapezoidPreference {
  rangeMin: number;
  rangeMax: number;
  falloffLeft: number;
  falloffRight: number;
}
