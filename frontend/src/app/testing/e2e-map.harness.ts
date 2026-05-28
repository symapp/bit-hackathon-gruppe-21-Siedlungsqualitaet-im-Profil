import type { Map } from 'maplibre-gl';

declare global {
  interface Window {
    /** Set in development/e2e so Playwright can inspect MapLibre state. */
    __SIEDLUNG_MAP__?: Map;
  }
}

export function exposeMapForE2e(map: Map): void {
  if (typeof window !== 'undefined') {
    window.__SIEDLUNG_MAP__ = map;
  }
}
