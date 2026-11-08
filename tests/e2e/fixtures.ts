import {
  type BrowserContext,
  test as base,
  expect,
  type Page,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type Request,
  type TestType,
} from '@playwright/test';

interface Fixtures {
  /** Every request of the test's browser context whose origin differs from the baseURL origin. */
  offOriginRequests: string[];
}

/**
 * The e2e `test`: `@playwright/test` plus the auto fixture `offOriginRequests`, which fails every
 * test that makes a request outside the playground's origin (`data:` and `blob:` URLs are exempt).
 */
export const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & Fixtures,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
> = base.extend<Fixtures>({
  offOriginRequests: [
    async (
      { context, baseURL }: { context: BrowserContext; baseURL: string | undefined },
      use: (offOrigin: string[]) => Promise<void>,
    ) => {
      if (baseURL === undefined) {
        throw new Error('offOriginRequests needs the baseURL option of playwright.config.ts');
      }
      const origin = new URL(baseURL).origin;
      const offOrigin: string[] = [];
      const onRequest = (request: Request): void => {
        const url = new URL(request.url());
        // A blob: URL's origin is its creator's, so only the protocol exempts it
        if (url.protocol === 'data:' || url.protocol === 'blob:') return;
        if (url.origin !== origin) offOrigin.push(request.url());
      };
      context.on('request', onRequest);
      await use(offOrigin);
      context.off('request', onRequest);
      expect(offOrigin, `requests left the playground origin ${origin}:`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Navigates to a playground route and waits until the page has settled, in this order:
 * 1. `page.goto(path)` loads the route.
 * 2. `.demo-container` is visible: every demo renders it, so React has rendered the text. The
 *    command root is no signal, because `/dialog` renders none until its trigger is clicked.
 * 3. `document.fonts.ready` resolves: a second guard for any font a rendered element still
 *    requests (a family no FontFace preloaded). Such a load starts only once the text exists, so
 *    this follows step 2; with the preloaded fonts it resolves at once.
 */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('.demo-container')).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
