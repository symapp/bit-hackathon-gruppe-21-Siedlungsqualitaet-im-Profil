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

  test('auto-applies preferences and closes sidebar after rating last place', async ({ page }) => {
    await page.goto('/preferences/tinder');
    await expect(page.getByTestId('tinder-page')).toBeVisible();
    await expect(page.getByTestId('tinder-place-card')).toBeVisible();

    // Rate places 1–9 with "Unentschieden" (neutral)
    for (let i = 1; i < 10; i++) {
      await page.getByRole('button', { name: 'Unentschieden' }).click();
      await expect(page.getByText(`Ort ${i + 1} von 10`)).toBeVisible({ timeout: 10000 });
    }

    // Rate the 10th and last place — should auto-finish
    await page.getByRole('button', { name: 'Unentschieden' }).click();

    // Verify navigation back to main page
    await expect(page).toHaveURL(/\/$/, { timeout: 15000 });

    // Verify brief toast after suggested place
    await expect(page.getByTestId('map-toast')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('map-toast')).toContainText('Empfehlung:');

    // Verify right sidebar is collapsed
    await expect(page.locator('.sidebar.collapsed')).toBeVisible({ timeout: 10000 });
  });
});
