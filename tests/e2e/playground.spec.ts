import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

// The playground app itself: its routes, navigation, theme and demos (C7). The library's own
// behaviour is covered by the other specs; each case here pins one playground contract.

const THEME_KEY = 'playground-theme';
const SITE_SUFFIX = 'modern-cmdk Playground';

/** Rasterises a computed CSS colour (possibly `oklch()`) and returns its sRGB channels. */
async function rasterise(page: Page, cssColor: string): Promise<[number, number, number]> {
  const rgb = await page.evaluate((color) => {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d canvas unavailable');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, cssColor);
  const [r = 0, g = 0, b = 0] = rgb;
  return [r, g, b];
}

/** The element's computed background colour as sRGB channels. */
async function backgroundOf(page: Page, target: Locator): Promise<[number, number, number]> {
  const color = await target.evaluate((el) => getComputedStyle(el).backgroundColor);
  return rasterise(page, color);
}

/** Relative luminance (WCAG) of sRGB channels in 0..255. */
function luminance([r, g, b]: readonly [number, number, number]): number {
  const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** A `#rrggbb` string as sRGB channels. */
function channelsOfHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [
    Number.parseInt(match[1] ?? '0', 16),
    Number.parseInt(match[2] ?? '0', 16),
    Number.parseInt(match[3] ?? '0', 16),
  ];
}

/** Resolves after two animation frames, so every state update of a prior event has rendered. */
function settleFrames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

const nav = (page: Page): Locator => page.getByRole('navigation', { name: 'Demo navigation' });

test.describe('RTL demo', () => {
  test("PG-25: the RTL demo's search landmark is named in Arabic and its direction is rtl", async ({
    page,
  }) => {
    await open(page, '/rtl');
    const search = page.getByRole('search', { name: 'لوحة الأوامر' });
    await expect(search).toBeVisible();
    await expect(page.locator('.rtl-container')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.rtl-container')).toHaveAttribute('lang', 'ar');
    expect(await search.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  });

  test('PG-01: the RTL demo renders Arabic, not escape sequences', async ({ page }) => {
    await open(page, '/rtl');
    const palette = page.locator('.rtl-container');
    await expect(palette.getByRole('combobox')).toHaveAttribute('placeholder', 'بحث…');
    await expect(palette.getByText('أوامر', { exact: true })).toBeVisible();
    await expect(palette.getByRole('option', { name: 'نسخ' })).toBeVisible();
    await expect(palette.getByRole('option', { name: 'لصق' })).toBeVisible();
    // No backslash-u sequence is visible text, an attribute value or an accessible name
    await expect(palette).not.toContainText('\\u');
    const attributes = await palette.evaluate((root) =>
      [root, ...root.querySelectorAll('*')].flatMap((el) =>
        [...el.attributes].map((attribute) => attribute.value),
      ),
    );
    expect(attributes.filter((value) => value.includes('\\u'))).toEqual([]);
  });

  test("PG-59: the RTL placeholder's ellipsis trails the word", async ({ page }) => {
    await open(page, '/rtl');
    const placeholder = await page
      .locator('.rtl-container')
      .getByRole('combobox')
      .getAttribute('placeholder');
    expect(placeholder).not.toBeNull();
    // U+2026 HORIZONTAL ELLIPSIS is the last character and the word comes first
    expect(placeholder?.endsWith('…')).toBe(true);
    expect(placeholder?.startsWith('.')).toBe(false);
    expect(placeholder?.startsWith('…')).toBe(false);
  });

  test("PG-19: an Arabic query finds the RTL demo's item", async ({ page }) => {
    await open(page, '/rtl');
    const palette = page.locator('.rtl-container');
    await palette.getByRole('combobox').fill('نسخ');
    // The filter has applied once exactly one option is left; on the defect none is left
    await expect(palette.getByRole('option')).toHaveCount(1);
    await expect(palette.getByRole('option', { name: 'نسخ' })).toBeVisible();
    await expect(palette.getByRole('option', { name: 'لصق' })).toHaveCount(0);
  });
});

test.describe('All States demo', () => {
  test('PG-03: the Loading State panel shows its loading indicator', async ({ page }) => {
    await open(page, '/all-states');
    const panel = page.locator('section', {
      has: page.getByRole('heading', { name: 'Loading State' }),
    });
    const loading = panel.locator('[data-command-loading]');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('role', 'status');
    await expect(loading).toHaveText('Searching...');
  });

  test.describe('at narrow viewports', () => {
    test.use({ viewport: { width: 360, height: 800 } });

    test('PG-28: the states grid fits 360 px and 320 px viewports', async ({ page }) => {
      await open(page, '/all-states');
      const grid = page.locator('.states-grid');
      await expect(grid).toBeVisible();
      // 360 px is the nominal width; 320 px is well under the 348 px below which a 300 px column
      // floor overflows (the base's grid is 292/300 at 340 px)
      for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await settleFrames(page);
        const widths = await page.evaluate(() => {
          const gridEl = document.querySelector('.states-grid');
          const root = document.documentElement;
          return {
            gridClient: gridEl?.clientWidth ?? 0,
            gridScroll: gridEl?.scrollWidth ?? 0,
            docClient: root.clientWidth,
            docScroll: root.scrollWidth,
          };
        });
        expect(widths.gridScroll, `grid overflows at ${width} px`).toBeLessThanOrEqual(
          widths.gridClient,
        );
        expect(widths.docScroll, `document overflows at ${width} px`).toBeLessThanOrEqual(
          widths.docClient,
        );
      }
    });
  });
});

test.describe('Error Boundary demo', () => {
  test('PG-06: Reset recovers the error boundary demo', async ({ page }) => {
    await open(page, '/error-boundary');
    const alert = page.getByRole('alert').filter({ hasText: 'Command Palette Error' });
    const input = page.locator('.demo-container').getByRole('combobox');
    await expect(input).toBeVisible();

    await page.getByRole('button', { name: 'Trigger Error' }).click();
    await expect(alert).toBeVisible();

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(alert).toHaveCount(0);
    await expect(input).toBeVisible();

    // The boundary arms again: a second trigger shows the fallback again
    await page.getByRole('button', { name: 'Trigger Error' }).click();
    await expect(alert).toBeVisible();
  });

  test("PG-54: the error demo's action button carries no aria-pressed", async ({ page }) => {
    await open(page, '/error-boundary');
    const action = page.locator('.demo-container .trigger-button');
    await expect(action).toHaveText('Trigger Error');
    await expect(action).not.toHaveAttribute('aria-pressed');
    await action.click();
    await expect(action).toHaveText('Reset');
    await expect(action).not.toHaveAttribute('aria-pressed');
  });
});

test.describe('Dark Mode demo', () => {
  test.describe('with the OS in dark mode', () => {
    test.use({ colorScheme: 'dark' });

    test('PG-05: the light preview re-themes the palette', async ({ page }) => {
      await open(page, '/dark-mode');
      const preview = page.locator('.theme-preview');
      await expect(preview).toHaveAttribute('data-theme-preview', 'dark');
      const palette = preview.locator('.command-palette');
      await expect.poll(async () => luminance(await backgroundOf(page, palette))).toBeLessThan(0.5);

      await page.locator('.demo-container .trigger-button').click();
      await expect(preview).toHaveAttribute('data-theme-preview', 'light');
      await expect
        .poll(async () => luminance(await backgroundOf(page, palette)))
        .toBeGreaterThan(0.5);
    });
  });

  test("PG-53: the dark mode demo's toggle keeps its name and reports aria-pressed", async ({
    page,
  }) => {
    await open(page, '/dark-mode');
    const toggle = page.getByRole('button', { name: 'Dark mode', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.theme-preview')).toHaveAttribute('data-theme-preview', 'dark');

    await toggle.click();
    await expect(page.locator('.theme-preview')).toHaveAttribute('data-theme-preview', 'light');
    await expect(page.getByRole('button', { name: 'Dark mode', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test.describe('with the OS in light mode', () => {
    test.use({ colorScheme: 'light' });

    test('PG-52: System Default applies the OS colour scheme', async ({ page }) => {
      await open(page, '/dark-mode');
      const preview = page.locator('.theme-preview');
      // The preview starts dark whatever the OS prefers
      await expect(preview).toHaveAttribute('data-theme-preview', 'dark');

      await page.getByRole('option', { name: 'System Default' }).click();
      await expect(preview).toHaveAttribute('data-theme-preview', 'light');

      await page.emulateMedia({ colorScheme: 'dark' });
      await page.getByRole('option', { name: 'Light Mode' }).click();
      await expect(preview).toHaveAttribute('data-theme-preview', 'light');
      await page.getByRole('option', { name: 'System Default' }).click();
      await expect(preview).toHaveAttribute('data-theme-preview', 'dark');
    });
  });
});

test.describe('Virtualized demo', () => {
  test('PG-27: count=Infinity and a huge count fall back to a bounded list', async ({
    page,
    browserName,
  }) => {
    // Firefox mounts the capped 100,000-item list in 14.03 s without the fixture's timeStamp stub
    // and in 4.67 s with it, Chromium in 2.23 s (measured 2026-11-09). One cause is React's
    // development build, which calls console.timeStamp once per rendered component; the shared
    // fixture stubs it in Firefox. The other is by design: the demo renders and registers all N
    // Command.Item components, which both engines pay.
    test.slow(browserName === 'firefox', 'the capped 100,000-item mount is slow in Firefox');
    const badge = page.locator('.demo-title .demo-badge');

    await open(page, '/virtualization?count=Infinity');
    await expect(badge).toHaveText('10,000 items');

    await open(page, '/virtualization?count=1000000');
    await expect(badge).toHaveText('100,000 items');

    // 1e6 is not a decimal integer, so it takes the default; one item is singular
    await open(page, '/virtualization?count=1e6');
    await expect(badge).toHaveText('10,000 items');

    await open(page, '/virtualization?count=1');
    await expect(badge).toHaveText('1 item');
  });

  test('PG-57: the virtualized demo renders its last selection', async ({ page }) => {
    await open(page, '/virtualization?count=200');
    await page.locator('#virt-item-0').click();
    await expect(page.getByTestId('last-selected')).toHaveText('Item 0 apple action');
  });
});

test.describe('Trigger button', () => {
  test("PG-29: the trigger button's hover glow paints", async ({ page }) => {
    await open(page, '/dialog');
    const button = page.locator('.trigger-button');
    await button.hover();
    // The ::after opacity transition is instant under reducedMotion: 'reduce'; the poll below
    // waits for the hovered state to be the computed one before any pixel is read
    await expect
      .poll(() => button.evaluate((el) => getComputedStyle(el, '::after').opacity))
      .toBe('1');

    const box = await button.boundingBox();
    if (!box) throw new Error('the trigger button has no box');
    // Inset 2 px: the 1 px ::after rim and the hover ring outside the box stay out of the clip
    const clip = {
      x: box.x + 2,
      y: box.y + 2,
      width: box.width - 4,
      height: box.height - 4,
    };
    const withGlow = await page.screenshot({ clip });

    await page.addStyleTag({ content: '.trigger-button::after { display: none !important; }' });
    await settleFrames(page);
    const withoutGlow = await page.screenshot({ clip });

    expect(withGlow.equals(withoutGlow), 'the ::after glow changes no pixel of the button').toBe(
      false,
    );
  });
});

test.describe('Theme', () => {
  test('PG-30: the playground root declares color-scheme dark and the light theme declares light', async ({
    page,
  }) => {
    await open(page, '/');
    const colorScheme = (): Promise<string> =>
      page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    expect(await colorScheme()).toBe('dark');

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    expect(await colorScheme()).toBe('light');

    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute(
      'content',
      'dark light',
    );
  });

  test.describe('with the OS in dark mode', () => {
    test.use({ colorScheme: 'dark' });

    test('PG-31: the playground restores the chosen theme on reload', async ({ page }) => {
      await open(page, '/');
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', 'dark');

      await page.getByRole('button', { name: 'Switch to light mode' }).click();
      await expect(html).toHaveAttribute('data-theme', 'light');
      expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe('light');

      await page.reload();
      await expect(page.locator('.demo-container')).toBeVisible();
      await expect(html).toHaveAttribute('data-theme', 'light');
      await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
    });
  });

  test("PG-69: each theme-color meta matches its theme's page background", async ({ page }) => {
    await open(page, '/');
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const content = await page
        .locator(`meta[name="theme-color"][media="(prefers-color-scheme: ${theme})"]`)
        .getAttribute('content', { timeout: 5_000 });
      expect(content, `${theme} theme-color meta`).not.toBeNull();
      const meta = channelsOfHex(content ?? '');
      // The hex is the sRGB rounding of an oklch() token: one unit of slack per channel. The poll
      // lets a background transition finish after the data-theme switch.
      await expect
        .poll(
          async () => {
            const background = await backgroundOf(page, page.locator('body'));
            return Math.max(
              ...meta.map((channel, index) => Math.abs(channel - (background[index] ?? 0))),
            );
          },
          { message: `${theme} theme-color ${content} vs the body background` },
        )
        .toBeLessThanOrEqual(1);
    }
  });
});

test.describe('Document head', () => {
  test('PGX-01: the playground requests no favicon.ico', async ({ page, context }) => {
    const faviconRequests: string[] = [];
    context.on('request', (request) => {
      if (new URL(request.url()).pathname === '/favicon.ico') faviconRequests.push(request.url());
    });
    await open(page, '/');
    await page.waitForLoadState('networkidle');
    await settleFrames(page);

    // Soft assertions report both facts: the request list and the declared icon
    expect.soft(faviconRequests, 'favicon.ico requests').toEqual([]);
    await expect
      .soft(page.locator('link[rel="icon"]'))
      .toHaveAttribute('href', /^data:image\/svg\+xml/);
  });
});

test.describe('Dialog demo shortcut', () => {
  test('PG-32: a held Ctrl+K toggles the dialog once', async ({ page }) => {
    await open(page, '/dialog');
    const trigger = page.locator('.trigger-button');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.down('Control');
    await page.keyboard.down('k');
    // The second down of the held key is sent with repeat: true (keyboard.down documentation)
    await page.keyboard.down('k');
    await page.keyboard.up('k');
    await page.keyboard.up('Control');
    await settleFrames(page);

    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('PG-32: Ctrl+K with Caps Lock on opens the dialog', async ({ page }) => {
    await open(page, '/dialog');
    // With Caps Lock on, the key value of the K key is the capital letter
    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('PG-42: clicking the current route adds no history entry', async ({ page }) => {
    await open(page, '/dialog');
    const current = nav(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('Dialog');
    const before = await page.evaluate(() => history.length);

    await current.click();
    await settleFrames(page);

    expect(await page.evaluate(() => history.length)).toBe(before);
    await expect(page).toHaveURL(/\/dialog$/);
  });

  test('PG-15: the demo navigation is links that Ctrl+click and the middle button open in a new tab', async ({
    page,
    context,
  }) => {
    await open(page, '/');
    const link = nav(page).getByRole('link', { name: 'Dialog' });
    await expect(link).toHaveAttribute('href', '/dialog');
    await expect(nav(page).getByRole('link', { name: 'Basic' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav(page).locator('[aria-controls]')).toHaveCount(0);

    for (const click of [
      (): Promise<void> => link.click({ modifiers: ['ControlOrMeta'] }),
      (): Promise<void> => link.click({ button: 'middle' }),
    ]) {
      const opened = context.waitForEvent('page');
      await click();
      const tab = await opened;
      await tab.waitForLoadState('domcontentloaded');
      expect(new URL(tab.url()).pathname).toBe('/dialog');
      await tab.close();
      // The current page stays where it was
      await expect(page).toHaveURL(/\/$/);
      await expect(nav(page).getByRole('link', { name: 'Basic' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }

    // A plain click still navigates in the app, in the same page
    await link.click();
    await expect(page).toHaveURL(/\/dialog$/);
    await expect(page.getByRole('heading', { name: 'Dialog Mode' })).toBeVisible();
  });

  test('PG-41: a route change titles the document and focuses the demo panel', async ({ page }) => {
    await open(page, '/');
    await expect(page).toHaveTitle(`Basic — ${SITE_SUFFIX}`);
    // The first render leaves the focus alone
    await expect(page.locator('main#demo-panel')).not.toBeFocused();

    await nav(page).getByText('Dialog', { exact: true }).click();
    await expect(page).toHaveTitle(`Dialog — ${SITE_SUFFIX}`);
    await expect(page.locator('main#demo-panel')).toBeFocused();

    // Back and forward move the focus too
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.goBack();
    await expect(page).toHaveTitle(`Basic — ${SITE_SUFFIX}`);
    await expect(page.locator('main#demo-panel')).toBeFocused();
  });
});
