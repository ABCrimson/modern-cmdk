import { expect, test as it, type Page } from '@playwright/test';

// Route view transitions (apps/docs/.vitepress/theme/view-transitions.ts; design-final.md 5). The spec runs against
// `vitepress preview` of the built site, so `pnpm docs:build` comes first. document.startViewTransition is wrapped in an
// init script that records, per call, the h1 on screen when the update callback finishes and whether the transition was
// skipped, so a transition that released early (the old page animating into itself) is visible to the test.

const SIDEBAR = '.VPSidebar';
const link = (path: string): string => `${SIDEBAR} a[href$="/guide/${path}.html"]`;

interface Entry {
  h1: string;
  skipped: boolean;
}

let pageErrors: string[] = [];
it.beforeEach(({ page }) => {
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
it.afterEach(() => {
  expect(pageErrors, 'uncaught page errors and unhandled rejections').toEqual([]);
});

async function recordViewTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: { h1: string; skipped: boolean }[] = [];
    Reflect.set(window, '__vtLog', log);
    const original = document.startViewTransition?.bind(document);
    if (original === undefined) return;
    document.startViewTransition = ((callback: () => Promise<void> | void): ViewTransition => {
      const entry = { h1: '', skipped: false };
      log.push(entry);
      const transition = original(async () => {
        await callback();
        entry.h1 = document.querySelector('h1')?.textContent ?? '';
      });
      transition.ready.catch(() => {
        entry.skipped = true;
      });
      return transition;
    }) as typeof document.startViewTransition;
  });
}

const log = (page: Page): Promise<Entry[]> =>
  page.evaluate(() => Reflect.get(window, '__vtLog') as Entry[]);

/** Client-navigates through the sidebar to the guide page `path`, which also caches its page module. */
async function visitThen(page: Page, path: string): Promise<void> {
  await page.locator(link(path)).first().click();
  await page.waitForURL(new RegExp(`/guide/${path}\\.html`));
  await expect(page.locator('h1')).toBeVisible();
}

const notMarked = (page: Page): Promise<void> =>
  expect(page.locator('html')).not.toHaveAttribute('data-mc-transition', /.*/);

it.describe('route view transitions', () => {
  it('a navigation overtaken by a later one does not release the later one early (M1)', async ({
    page,
  }) => {
    await recordViewTransitions(page);
    await page.goto('guide/frecency.html');
    await visitThen(page, 'getting-started');
    await visitThen(page, 'frecency');
    await visitThen(page, 'getting-started');
    const before = (await log(page)).length;

    // Both clicks in one task: the accessibility load is dropped by the router, its go() still calls onAfterRouteChange.
    await page.evaluate(
      ({ a, b }) => {
        document.querySelector<HTMLAnchorElement>(a)?.click();
        document.querySelector<HTMLAnchorElement>(b)?.click();
      },
      { a: link('accessibility'), b: link('frecency') },
    );
    await page.waitForURL(/\/guide\/frecency\.html/);
    await expect(page.locator('h1')).toContainText(/frecency/i);
    await notMarked(page);

    const entries = (await log(page)).slice(before);
    expect(entries.length, 'a transition ran').toBeGreaterThan(0);
    const last = entries.at(-1);
    expect(last?.h1, 'the update callback finished with the new page in the DOM').toMatch(
      /frecency/i,
    );
    expect(last?.skipped, 'the last transition was not skipped (no hard cut)').toBe(false);
  });

  it('back, back, forward ends on the page and heading it should (M2)', async ({ page }) => {
    await recordViewTransitions(page);
    await page.goto('guide/getting-started.html');
    await visitThen(page, 'installation');
    await page.locator('.VPDocAsideOutline a[href="#peer-dependencies"]').first().click();
    await expect(page).toHaveURL(/installation\.html#peer-dependencies/);
    await visitThen(page, 'frecency');
    await notMarked(page);
    // VitePress scrolls to the top once after a page load (router.js:49-60), so scroll until it sticks.
    await expect
      .poll(() =>
        page.evaluate(() => {
          scrollTo(0, 900);
          return scrollY;
        }),
      )
      .toBeGreaterThan(800);

    // Each traversal is awaited only until its popstate fires, not until VitePress has loaded the page.
    await page.evaluate(async () => {
      const step = (delta: number): Promise<void> =>
        new Promise((resolve) => {
          addEventListener('popstate', () => resolve(), { once: true });
          history.go(delta);
        });
      await step(-1);
      await step(-1);
      await step(1);
    });
    await expect(page).toHaveURL(/installation\.html#peer-dependencies/);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const top = document.getElementById('peer-dependencies')?.getBoundingClientRect().top;
            return top !== undefined && top >= 0 && top < innerHeight;
          }),
        { message: '#peer-dependencies is in view' },
      )
      .toBe(true);
    await notMarked(page);
  });

  it('a page-to-page click starts a transition and releases the marker', async ({ page }) => {
    await recordViewTransitions(page);
    await page.goto('guide/getting-started.html');
    await visitThen(page, 'installation');
    await expect.poll(async () => (await log(page)).length).toBe(1);
    await notMarked(page);
  });

  it('a hash-only link starts no transition', async ({ page }) => {
    await recordViewTransitions(page);
    await page.goto('guide/installation.html');
    await page.locator('.VPDocAsideOutline a[href="#peer-dependencies"]').first().click();
    await expect(page).toHaveURL(/#peer-dependencies/);
    expect(await log(page)).toEqual([]);
  });

  it('prefers-reduced-motion starts no transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await recordViewTransitions(page);
    await page.goto('guide/getting-started.html');
    await visitThen(page, 'installation');
    expect(await log(page)).toEqual([]);
  });
});
