export const environment = {
  zarrBaseUrl: 'https://egov-hackathon.s3.eu-central-003.backblazeb2.com',
  /** Set true after uploading *_500m.zarr and *_1000m.zarr from coarsen_settlement_layers.py */
  overviewCoarseAvailable: false,
  /**
   * When false, skips HTTP fetch of settlement-layer-meta.json (uses clim from config).
   * Enable once meta sidecars are deployed next to each GeoZarr store.
   */
  settlementLayerMetaAvailable: true,
};
