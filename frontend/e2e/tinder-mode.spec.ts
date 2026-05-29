import { expect, test } from '@playwright/test';

test.describe('Tinder mode onboarding', () => {
  test('opens dedicated route from button and renders page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Später' }).click();
    await expect(page.getByRole('link', { name: 'Tinder-Modus öffnen' })).toBeVisible();
    await page.getByRole('link', { name: 'Tinder-Modus öffnen' }).click();

    await expect(page).toHaveURL(/\/preferences\/tinder$/);
    await expect(page.getByTestId('tinder-page')).toBeVisible();
    await expect(page.getByTestId('tinder-place-card')).toBeVisible();
  });

  test('first-open prompt can start onboarding', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Tinder-Modus starten' })).toBeVisible();
    await page.getByRole('button', { name: 'Tinder-Modus starten' }).click();
    await expect(page).toHaveURL(/\/preferences\/tinder$/);
  });
});
