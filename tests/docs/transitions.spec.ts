import { expect, test as it, type Page } from '@playwright/test';

// Route view transitions (apps/docs/.vitepress/theme/view-transitions.ts; design-final.md 5). The spec runs against
// the built site (scripts/serve-dist.mjs), so `pnpm docs:build` comes first. document.startViewTransition is wrapped in an
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
    // A per-document marker: a full document load (a click handled before the router existed) gets a new one, so a test can tell
    // a hard navigation from a client navigation that skipped its transition.
    Reflect.set(window, '__docMarker', Math.random());
    const log: { h1: string; skipped: boolean }[] = [];
    Reflect.set(window, '__vtLog', log);
    const original = document.startViewTransition?.bind(document);
    if (original === undefined) return;
    document.startViewTransition = ((callback: () => Promise<void> | void): ViewTransition => {
      const entry = { h1: '', skipped: false };
      log.push(entry);
      // A test arms `__releaseHeld`: the held page chunk is released as the transition starts, and the update callback
      // is delayed (well inside the 600 ms timeout of view-transitions.ts) so the abandoned navigation finishes first.
      const release = Reflect.get(window, '__releaseHeld') as (() => void) | undefined;
      let delay = 0;
      if (Reflect.get(window, '__armRelease') === true && release !== undefined) {
        Reflect.set(window, '__armRelease', false);
        release();
        delay = 200;
      }
      const transition = original(async () => {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
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

const docMarker = (page: Page): Promise<number> =>
  page.evaluate(() => Reflect.get(window, '__docMarker') as number);

/** Opens `path` and waits for Vue to render into #app (the renderer stores the root vnode on the container as `_vnode`; the
 *  static HTML has none). VitePress registers its click listener synchronously when the entry module runs (router.js:95,
 *  createRouter at module top level), before the load event goto() waits for, so this wait does not guard the router: it
 *  only makes sure the app has rendered before the first click. */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => Reflect.has(document.querySelector('#app') ?? {}, '_vnode'));
}

const log = (page: Page): Promise<Entry[]> =>
  page.evaluate(() => Reflect.get(window, '__vtLog') as Entry[]);

const notMarked = (page: Page): Promise<void> =>
  expect(page.locator('html')).not.toHaveAttribute('data-mc-transition', /.*/);

/**
 * Client-navigates through the sidebar to the guide page `path`, which also caches its page module, and returns only when the
 * navigation has finished: the new page's h1 (`heading`) is on screen and the transition marker is released. The URL alone is
 * not enough: VitePress calls history.pushState in changeRoute (router.js:195) before it loads the page (router.js:27), and
 * the transition starts in onAfterPageLoad (view-transitions.ts), so right after waitForURL the old h1 is still on screen
 * and a view-transition log entry may not exist yet. The h1 swap happens inside the update callback, after the entry is logged.
 */
async function visitThen(page: Page, path: string, heading: RegExp): Promise<void> {
  await page.locator(link(path)).first().click();
  await page.waitForURL(new RegExp(`/guide/${path}\\.html`));
  await expect(page.locator('h1')).toContainText(heading);
  await notMarked(page);
}

it.describe('route view transitions', () => {
  it('a navigation overtaken by a later one does not release the later one early (M1)', async ({
    page,
  }) => {
    // The accessibility page chunk is held until the frecency transition has started, so the abandoned navigation always
    // finishes (router.js:30 still calls onAfterRouteChange for it) while the frecency transition waits for its swap.
    const held: (() => Promise<void>)[] = [];
    let released = false;
    await page.route(/\/assets\/guide_accessibility\.md\.[\w-]+\.js$/, async (route) => {
      if (released) await route.continue();
      else held.push(() => route.continue());
    });
    await page.exposeFunction('__releaseHeld', () => {
      released = true;
      for (const resume of held.splice(0)) void resume();
    });
    await recordViewTransitions(page);
    await open(page, 'guide/frecency.html');
    const marker = await docMarker(page);
    await visitThen(page, 'getting-started', /getting started/i);
    await visitThen(page, 'frecency', /frecency/i);
    await visitThen(page, 'getting-started', /getting started/i);
    const before = (await log(page)).length;

    // Both clicks in one task: the router drops the accessibility load once the frecency one has started.
    await page.evaluate(
      ({ a, b }) => {
        Reflect.set(window, '__armRelease', true);
        document.querySelector<HTMLAnchorElement>(a)?.click();
        document.querySelector<HTMLAnchorElement>(b)?.click();
      },
      { a: link('accessibility'), b: link('frecency') },
    );
    await page.waitForURL(/\/guide\/frecency\.html/);
    await expect(page.locator('h1')).toContainText(/frecency/i);
    await notMarked(page);

    expect(await docMarker(page), 'no full document reload: the router handled every click').toBe(
      marker,
    );
    const entries = (await log(page)).slice(before);
    expect(entries.length, 'a transition ran').toBeGreaterThan(0);
    const last = entries.at(-1);
    expect(last?.h1, 'the update callback finished with the new page in the DOM').toMatch(
      /frecency/i,
    );
    expect(last?.skipped, 'the last transition was not skipped (no hard cut)').toBe(false);
  });

  it('back and forward start no view transition, and a later click still does (M2)', async ({
    page,
  }) => {
    // Rapid back, back, forward ended at the wrong scroll position while the popstate load was held open inside a
    // transition (VitePress drops overtaken loads, router.js:42). The mechanism is tested, not the scroll: history
    // traversals get a hard cut, and a traversal must not leave a flag behind that swallows the next click.
    await recordViewTransitions(page);
    await open(page, 'guide/getting-started.html');
    await visitThen(page, 'installation', /installation/i);
    await notMarked(page);
    const before = (await log(page)).length;
    await page.goBack();
    await expect(page).toHaveURL(/getting-started\.html/);
    await expect(page.locator('h1')).toContainText(/getting started/i);
    await page.goForward();
    await expect(page).toHaveURL(/installation\.html/);
    await expect(page.locator('h1')).toContainText(/installation/i);
    expect((await log(page)).length, 'no transition on back or forward').toBe(before);
    await visitThen(page, 'frecency', /frecency/i);
    await expect
      .poll(async () => (await log(page)).length, {
        message: 'the click after the traversals transitions',
      })
      .toBe(before + 1);
  });

  it('a page-to-page click starts a transition and releases the marker', async ({ page }) => {
    await recordViewTransitions(page);
    await open(page, 'guide/getting-started.html');
    await visitThen(page, 'installation', /installation/i);
    await expect.poll(async () => (await log(page)).length).toBe(1);
    await notMarked(page);
  });

  it('a hash-only link starts no transition (a VitePress smoke guard: its hooks never run)', async ({
    page,
  }) => {
    // router.js:205 returns before loadPage for a same-path hash change, so view-transitions.ts is not reached.
    await recordViewTransitions(page);
    await open(page, 'guide/installation.html');
    await page.locator('.VPDocAsideOutline a[href="#peer-dependencies"]').first().click();
    await expect(page).toHaveURL(/#peer-dependencies/);
    expect(await log(page)).toEqual([]);
  });

  it('prefers-reduced-motion starts no transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await recordViewTransitions(page);
    await open(page, 'guide/getting-started.html');
    await visitThen(page, 'installation', /installation/i);
    expect(await log(page)).toEqual([]);
  });
});
