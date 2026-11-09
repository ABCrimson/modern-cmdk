import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

// The OS colour scheme decides the initial playground theme; the toggle label must agree with it.

/**
 * Relative luminance (WCAG) of the body background. The computed value may be `oklch()`, so the
 * browser rasterises it to a canvas pixel and the sRGB channels are read back from there.
 */
async function bodyLuminance(page: Page): Promise<number> {
  const rgb = await page.evaluate(() => {
    // A DOM canvas: Playwright's WebKit 27.2 build for Windows has no OffscreenCanvas.
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d canvas unavailable');
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  });
  const [r = 0, g = 0, b = 0] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe('Initial theme follows prefers-color-scheme', () => {
  test.describe('OS in light mode', () => {
    test.use({ colorScheme: 'light' });

    test('starts light and the toggle offers dark', async ({ page }) => {
      await open(page, '/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
      await expect.poll(() => bodyLuminance(page)).toBeGreaterThan(0.5);
    });

    test('clicking the toggle switches to dark and flips the name', async ({ page }) => {
      await open(page, '/');
      await page.getByRole('button', { name: 'Switch to dark mode' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
      await expect.poll(() => bodyLuminance(page)).toBeLessThan(0.5);
    });
  });

  test.describe('OS in dark mode', () => {
    test.use({ colorScheme: 'dark' });

    test('starts dark and the toggle offers light', async ({ page }) => {
      await open(page, '/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
      await expect.poll(() => bodyLuminance(page)).toBeLessThan(0.5);
    });

    // accessibility.spec.ts runs on Playwright's default light scheme; this gates the dark ramp.
    test('dark theme has no colour-contrast violations', async ({ page }) => {
      await open(page, '/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      // withRules alone: in @axe-core/playwright withRules and withTags each replace runOnly, so a
      // tag filter before withRules would be discarded (its JSDoc: "Cannot be used with withRules").
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect(results.violations).toEqual([]);
    });
  });
});
