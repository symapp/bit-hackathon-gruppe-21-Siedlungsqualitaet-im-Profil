declare global {
  interface Window {
    __SIEDLUNG_OVERVIEW__?: OverviewE2eState;
  }
}

export interface OverviewE2eState {
  generation: number;
  lastFetchLayerCount: number;
  cacheHits: number;
  cacheMisses: number;
  loading: boolean;
}

export function exposeOverviewForE2e(getState: () => OverviewE2eState): void {
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, '__SIEDLUNG_OVERVIEW__', {
      get: getState,
      configurable: true,
    });
  }
}
