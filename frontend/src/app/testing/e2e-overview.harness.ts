declare global {
  interface Window {
    __SIEDLUNG_OVERVIEW__?: OverviewE2eState;
    __SIEDLUNG_SYNC_OVERVIEW__?: () => void;
  }
}

export interface OverviewE2eState {
  generation: number;
  lastFetchLayerCount: number;
  cacheHits: number;
  cacheMisses: number;
  loading: boolean;
  /** WGS84 lng+lat span of the last overview image footprint (for e2e). */
  imageFootprintSpan: number;
  /** fullNx * fullNy of the last overview viewport (100 m cells). */
  overviewFullCells: number;
}

export function exposeOverviewForE2e(
  getState: () => OverviewE2eState,
  syncToViewport: () => void,
): void {
  if (typeof window !== 'undefined') {
    window.__SIEDLUNG_SYNC_OVERVIEW__ = syncToViewport;
    Object.defineProperty(window, '__SIEDLUNG_OVERVIEW__', {
      get: getState,
      configurable: true,
    });
  }
}
