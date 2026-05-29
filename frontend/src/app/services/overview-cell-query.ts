import type { ZarrLayer } from '@carbonplan/zarr-layer';
import type { Selector } from '@carbonplan/zarr-layer';
import type { ZarrLayerDefinition } from '../config/zarr-layers.config';
import type { OverviewLodPlan } from '../utils/overview-lod.util';
import { coarseStorePath } from '../utils/overview-lod.util';
import type { ViewportCellExtent } from '../utils/swiss-grid.util';
import { parseRegionQueryToCellMap, viewportBboxPolygon } from './settlement-overview-composite';
import { queryCellWindowByIndex } from './overview-zarr-slice';

export interface OverviewQueryContext {
  definition: ZarrLayerDefinition;
  layer: ZarrLayer;
  plan: OverviewLodPlan;
}

export async function queryOverviewCellMap(
  ctx: OverviewQueryContext,
  west: number,
  south: number,
  east: number,
  north: number,
  extent: ViewportCellExtent,
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const { definition, layer, plan } = ctx;
  const storePath = coarseStorePath(definition, plan.tier);

  if (plan.readMode === 'polygon') {
    const bbox = viewportBboxPolygon(west, south, east, north);
    const result = await layer.queryData(bbox, definition.selector, { signal });
    return parseRegionQueryToCellMap(result, definition.variable);
  }

  try {
    return await queryCellWindowByIndex(
      storePath,
      definition.variable,
      extent,
      plan.blockFactor,
      extent.stride,
      definition.selector,
      signal,
    );
  } catch (err) {
    if (plan.tier !== 'L100') {
      console.warn(`[overview] coarse fetch failed for ${definition.id}, falling back to L100`, err);
      return queryCellWindowByIndex(
        definition.storePath,
        definition.variable,
        extent,
        1,
        extent.stride,
        definition.selector,
        signal,
      );
    }
    throw err;
  }
}
