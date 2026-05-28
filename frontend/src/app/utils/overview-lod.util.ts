import type { ZarrLayerDefinition } from '../config/zarr-layers.config';
import { SWISS_GRID_CELL_COUNT } from './swiss-grid.util';

export type OverviewGridTier = 'L100' | 'L500' | 'L1000';
export type OverviewReadMode = 'polygon' | 'index_slice';

export const LOD_R1_MAX_CELLS = 35_000;
export const LOD_R2_MAX_CELLS = 120_000;
export const LOD_R3_MAX_CELLS = 500_000;
export const LOD_CH_COVERAGE_FORCE_L1000 = 0.65;

export interface OverviewLodPlan {
  tier: OverviewGridTier;
  readMode: OverviewReadMode;
  cellM: 100 | 500 | 1000;
  blockFactor: number;
}

export function resolveOverviewLod(
  zoom: number,
  fullNx: number,
  fullNy: number,
): OverviewLodPlan {
  const cellCount = fullNx * fullNy;
  const chCells = SWISS_GRID_CELL_COUNT.nx * SWISS_GRID_CELL_COUNT.ny;
  const coverage = cellCount / chCells;

  if (coverage > LOD_CH_COVERAGE_FORCE_L1000) {
    return { tier: 'L1000', readMode: 'index_slice', cellM: 1000, blockFactor: 10 };
  }

  if (zoom >= 11 && cellCount <= LOD_R1_MAX_CELLS) {
    return { tier: 'L100', readMode: 'polygon', cellM: 100, blockFactor: 1 };
  }

  if (zoom >= 10 && cellCount <= LOD_R2_MAX_CELLS) {
    return { tier: 'L100', readMode: 'index_slice', cellM: 100, blockFactor: 1 };
  }

  if (zoom >= 9 || cellCount <= LOD_R3_MAX_CELLS) {
    return { tier: 'L500', readMode: 'index_slice', cellM: 500, blockFactor: 5 };
  }

  return { tier: 'L1000', readMode: 'index_slice', cellM: 1000, blockFactor: 10 };
}

export function coarseStorePath(definition: ZarrLayerDefinition, tier: OverviewGridTier): string {
  if (tier === 'L100') {
    return definition.storePath;
  }
  const coarse = definition.overviewCoarse;
  if (tier === 'L500' && coarse?.storePath500) {
    return coarse.storePath500;
  }
  if (tier === 'L1000' && coarse?.storePath1000) {
    return coarse.storePath1000;
  }
  const base = definition.storePath.replace(/\.zarr\/?$/i, '');
  return tier === 'L500' ? `${base}_500m.zarr` : `${base}_1000m.zarr`;
}

export function overviewCompositeDebounceMs(plan: OverviewLodPlan): number {
  if (plan.tier === 'L100' && plan.readMode === 'polygon') {
    return 180;
  }
  return 300;
}
