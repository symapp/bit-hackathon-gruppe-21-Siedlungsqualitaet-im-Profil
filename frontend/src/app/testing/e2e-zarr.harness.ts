declare global {
  interface Window {
    /** Sample a single Zarr layer at WGS84 (development / Playwright). */
    __SIEDLUNG_ZARR_SAMPLE__?: (
      lng: number,
      lat: number,
      layerId: string,
    ) => Promise<number | null>;
  }
}

export function exposeZarrSampleForE2e(
  sample: (lng: number, lat: number, layerId: string) => Promise<number | null>,
): void {
  if (typeof window !== 'undefined') {
    window.__SIEDLUNG_ZARR_SAMPLE__ = sample;
  }
}
