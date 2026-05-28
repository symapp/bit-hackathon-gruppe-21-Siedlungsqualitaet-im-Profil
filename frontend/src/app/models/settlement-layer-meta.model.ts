/** Sidecar metadata written by pipelines next to each GeoZarr store. */
export interface SettlementLayerMeta {
  variable: string;
  p5: number;
  p95: number;
  higherIsBetter: boolean;
  unit: string;
}

export const SETTLEMENT_LAYER_META_FILENAME = 'settlement-layer-meta.json';

export function settlementLayerMetaUrl(storePath: string): string {
  const base = storePath.endsWith('/') ? storePath.slice(0, -1) : storePath;
  return `${base}/${SETTLEMENT_LAYER_META_FILENAME}`;
}
