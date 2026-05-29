/** User preference for one settlement-quality factor (piecewise-linear curve on t ∈ [0, 1]). */
export interface LayerPreference {
  enabled: boolean;
  /** Weight in weighted mean of factor scores (0–200). */
  importance: number;
  /** Plateau start on preference scale t (left side of chart = lower t). */
  rangeMin: number;
  /** Plateau end on preference scale t (right side = higher t). */
  rangeMax: number;
  /** Linear falloff width left of the plateau (on t scale). */
  falloffLeft: number;
  /** Linear falloff width right of the plateau (on t scale). */
  falloffRight: number;
  /** Factor at or left of the left falloff anchor (0–1). Default 0. */
  floorLeft?: number;
  /** Factor at or right of the right falloff anchor (0–1). Default 0. */
  floorRight?: number;
  /**
   * Factor at the left plateau corner (0–1). Default 1.
   * @deprecated Use plateauLeftFactor; kept for migration.
   */
  plateauFactor?: number;
  /** Factor at rangeMin (left plateau corner). */
  plateauLeftFactor?: number;
  /** Factor at rangeMax (right plateau corner). */
  plateauRightFactor?: number;
}

export interface CurvePreference {
  rangeMin: number;
  rangeMax: number;
  falloffLeft: number;
  falloffRight: number;
  floorLeft?: number;
  floorRight?: number;
  plateauFactor?: number;
  plateauLeftFactor?: number;
  plateauRightFactor?: number;
}

/** @deprecated Use CurvePreference */
export type TrapezoidPreference = CurvePreference;
