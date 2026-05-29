import { TestBed } from '@angular/core/testing';
import { ZarrMapService } from './zarr-map.service';

describe('ZarrMapService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('updates the shared overlay opacity state and visible raster paint property', () => {
    const service = TestBed.inject(ZarrMapService);
    const setPaintProperty = vi.fn();

    (
      service as unknown as {
        map: { getLayer: (id: string) => boolean; setPaintProperty: typeof setPaintProperty };
      }
    ).map = {
      getLayer: (id: string) => id === 'settlement-overview-layer',
      setPaintProperty,
    };

    service.setOverlayOpacity(61);

    expect(service.overlayOpacity()).toBe(61);
    expect(setPaintProperty).toHaveBeenCalledWith(
      'settlement-overview-layer',
      'raster-opacity',
      0.61,
    );
  });
});
