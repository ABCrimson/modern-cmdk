import { expect, test as it } from '@playwright/test';

// The 404 page (design-final.md 4.8). A path that does not exist is answered with 404.html; its page finder starts from the
// requested address, and without JavaScript the <noscript> fallback of config.ts transformHtml lists five links.

const MISSING = 'guide/frecncy.html';

let pageErrors: string[] = [];
it.beforeEach(({ page }) => {
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
it.afterEach(() => {
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});

it('a mistyped address shows the heading, the requested path and Frecency first', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await page.goto(MISSING);
  expect(response?.status()).toBe(404);

  const main = page.locator('main[data-mc="not-found"]');
  await expect(main).toHaveCount(1);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(main.locator('h1')).toHaveText('No page at this address');
  await expect(main).toContainText('/modern-cmdk/guide/frecncy.html');

  await page.locator('[data-mc="palette"][data-hydrated]').waitFor();
  await expect(page.locator('[data-mc="palette-input"]')).toHaveValue('frecncy');
  const first = page.locator('[data-mc="palette"] [role="option"]').first();
  await expect(first.locator('[data-mc="palette-label"]')).toHaveText('Frecency');
});

it('is kept out of search indexes', async ({ page }) => {
  await page.goto(MISSING);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Page not found · modern-cmdk',
  );
});

it.describe('without JavaScript', () => {
  it.use({ javaScriptEnabled: false });

  it('lists the five links of the <noscript> fallback and the first one navigates', async ({
    page,
  }) => {
    await page.goto(MISSING);
    const main = page.locator('main[data-mc="not-found"]');
    await expect(main.locator('h1')).toHaveText('No page at this address');
    const links = main.locator('a[href]');
    await expect(links).toHaveCount(5);
    await expect(links).toHaveText([
      'Getting started',
      'Installation',
      'Core API',
      'Examples',
      'Migrate from cmdk',
    ]);
    expect(
      await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
    ).toEqual([
      '/modern-cmdk/guide/getting-started.html',
      '/modern-cmdk/guide/installation.html',
      '/modern-cmdk/api/command.html',
      '/modern-cmdk/examples/basic.html',
      '/modern-cmdk/guide/migration-from-cmdk.html',
    ]);
    await links.first().click();
    await page.waitForURL('**/modern-cmdk/guide/getting-started.html');
  });
});
