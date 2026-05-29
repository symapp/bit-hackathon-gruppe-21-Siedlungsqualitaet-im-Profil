import { expect, test } from '@playwright/test';

/** Dense built-up hectare (STATPOP SW 2683500, 1247400 → center ≈ this WGS). */
const ALTSTADT = { lng: 8.54487, lat: 47.37259 };
/** Mid Zürichsee surface (no STATPOP hectare within 100 m). */
const LAKE_WATER = { lng: 8.55, lat: 47.35 };

async function waitForZarrReady(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByTestId('map-container')).toBeVisible();
  await expect
    .poll(async () => page.locator('.map-layer-card.loading').count(), { timeout: 90_000 })
    .toBe(0);
}

async function sampleZarr(
  page: import('@playwright/test').Page,
  lng: number,
  lat: number,
  layerId: string,
): Promise<number | null> {
  return page.evaluate(
    async ({ lng, lat, layerId }) => {
      const fn = window.__SIEDLUNG_ZARR_SAMPLE__;
      if (!fn) {
        return null;
      }
      return fn(lng, lat, layerId);
    },
    { lng, lat, layerId },
  );
}

test.describe('Population density Zurich', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForZarrReady(page);
  });

  test('point query: high density in Altstadt, none on open lake', async ({ page }) => {
    const altstadt = await sampleZarr(page, ALTSTADT.lng, ALTSTADT.lat, 'population-density');
    const lake = await sampleZarr(page, LAKE_WATER.lng, LAKE_WATER.lat, 'population-density');

    expect(altstadt, `expected population at Altstadt, got ${altstadt}`).toBeGreaterThan(5_000);
    expect(lake === null || lake < 500, `lake sample should be empty, got ${lake}`).toBeTruthy();
  });

  test('point query at map default center matches dense urban cell', async ({ page }) => {
    const value = await sampleZarr(page, ALTSTADT.lng, ALTSTADT.lat, 'population-density');
    expect(value, 'Altstadt WGS sample').toBeGreaterThan(5_000);
  });
});
