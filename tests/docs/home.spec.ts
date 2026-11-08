import { expect, test as it, type Locator, type Page } from '@playwright/test';

// The redesigned home page (design-final.md 3, 5 and 8; item 8). It runs against `vitepress preview` of the built site, so
// `pnpm docs:build` comes first. The palette in the hero is the real modern-cmdk core driven from Vue.

const HYDRATED = '[data-mc="palette"][data-hydrated]';
const STATS = ['core', 'core-react', 'search-10k', 'deps'] as const;

type Scheme = 'light' | 'dark';
type Rgb = readonly [number, number, number];

let pageErrors: string[] = [];
it.beforeEach(({ page }) => {
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
it.afterEach(() => {
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});

/** VitePress reads this key before first paint (its inline script), so the scheme is set before any CSS is applied. */
async function chooseScheme(page: Page, scheme: Scheme): Promise<void> {
  await page.addInitScript(
    (value) => localStorage.setItem('vitepress-theme-appearance', value),
    scheme,
  );
}

/**
 * Counts the calls to document.startViewTransition in `window.__vt`. VPSwitchAppearance falls back to its own instant toggle
 * when nothing provides 'toggle-appearance', so a flipped colour alone does not prove that Layout.vue's provide() is wired: the
 * call count does.
 */
async function countViewTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.set(window, '__vt', 0);
    const original = document.startViewTransition?.bind(document);
    if (original === undefined) return;
    document.startViewTransition = (...args: Parameters<typeof original>): ViewTransition => {
      Reflect.set(window, '__vt', (Reflect.get(window, '__vt') as number) + 1);
      return original(...args);
    };
  });
}

const viewTransitions = (page: Page): Promise<number> =>
  page.evaluate(() => Reflect.get(window, '__vt') as number);

/** The sRGB bytes of any CSS colour the browser accepts (oklch(), light-dark() results, rgb()), through a 1x1 canvas. */
async function rgbOf(page: Page, cssColor: string): Promise<Rgb> {
  return page.evaluate((value) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('no 2d canvas');
    context.fillStyle = '#000';
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as const;
  }, cssColor);
}

function luminance([r, g, b]: Rgb): number {
  const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((byte) => {
    const channel = byte / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const rgbString = ([r, g, b]: Rgb): string => `rgb(${r}, ${g}, ${b})`;

it.describe('home page with the palette', () => {
  it('typing "frec" filters to the Frecency rows and Enter opens the guide', async ({ page }) => {
    // reduced motion keeps the autoplay script off the input
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('');
    await page.locator(HYDRATED).waitFor();
    const input = page.locator('[data-mc="palette-input"]');
    await input.fill('frec');

    const rows = page.locator('[data-mc="palette"] [role="option"]');
    await expect(rows.first()).toContainText('Frecency');
    // every row that remains is a fuzzy match of the four letters, so the 18 entries shrink
    expect(await rows.count()).toBeLessThan(18);
    for (const row of await rows.all()) {
      expect(
        ((await row.locator('[data-mc="palette-label"]').textContent()) ?? '').toLowerCase(),
      ).toMatch(/f.*r.*e.*c/);
    }

    await input.press('Enter');
    await page.waitForURL('**/modern-cmdk/guide/frecency.html');
  });

  it('with reduced motion the input stays empty for 3 s and autoplay never starts', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('');
    await page.locator(HYDRATED).waitFor();
    await page.waitForTimeout(3000);
    await expect(page.locator('[data-mc="palette-input"]')).toHaveValue('');
    await expect(page.locator('[data-mc="palette"]')).not.toHaveAttribute('data-autoplay', /.*/);
    await expect(page.locator('button[data-mc="palette-pause"]')).toHaveCount(0);
  });

  it('without reduced motion the autoplay runs, shows Pause, and Pause stops it', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('');
    const palette = page.locator('[data-mc="palette"]').first();
    await palette.waitFor();
    await palette.scrollIntoViewIfNeeded();
    await expect(palette).toHaveAttribute('data-autoplay', /.*/, { timeout: 15_000 });
    // the script types into the real input
    await expect(page.locator('[data-mc="palette-input"]').first()).not.toHaveValue('', {
      timeout: 5000,
    });
    const pause = page.locator('button[data-mc="palette-pause"]');
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(palette).not.toHaveAttribute('data-autoplay', /.*/);
    await expect(pause).toHaveCount(0);
  });

  it('renders the four numbers, their footnotes and exactly one main landmark', async ({
    page,
  }) => {
    await page.goto('');
    for (const stat of STATS) {
      await expect(
        page.locator(`[data-mc="stat"][data-stat="${stat}"]`),
        `stat ${stat}`,
      ).toHaveCount(1);
    }
    await expect(page.locator('[data-mc="footnotes"]')).toBeVisible();
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('main[data-mc="home"]')).toHaveCount(1);
  });

  for (const scheme of ['light', 'dark'] as const) {
    it(`the Get started button keeps white text above 4.5:1 at rest, on hover and pressed (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await chooseScheme(page, scheme);
      await page.goto('');
      await page.locator(HYDRATED).waitFor();
      const button = page.locator('.VPHero .VPButton.brand').first();
      await expect(button).toBeVisible();

      const read = async (): Promise<{ text: Rgb; fill: Rgb }> => {
        const [color, background] = await button.evaluate((el) => {
          const style = getComputedStyle(el);
          return [style.color, style.backgroundColor];
        });
        return { text: await rgbOf(page, color ?? ''), fill: await rgbOf(page, background ?? '') };
      };

      const rest = await read();
      expect(contrast(rest.text, rest.fill), 'rest').toBeGreaterThanOrEqual(4.5);

      await button.hover();
      await expect.poll(async () => rgbString((await read()).fill)).not.toBe(rgbString(rest.fill));
      const hover = await read();
      expect(contrast(hover.text, hover.fill), 'hover').toBeGreaterThanOrEqual(4.5);

      await page.mouse.down();
      await expect.poll(async () => rgbString((await read()).fill)).not.toBe(rgbString(hover.fill));
      const active = await read();
      expect(contrast(active.text, active.fill), 'pressed').toBeGreaterThanOrEqual(4.5);
      // release away from the link, so the click does not navigate
      await page.mouse.move(2, 2);
      await page.mouse.up();
    });
  }

  it('the appearance switch flips the page background from #fcfcfe to #0a0e27', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await chooseScheme(page, 'light');
    await countViewTransitions(page);
    await page.goto('');
    await page.locator(HYDRATED).waitFor();
    // Vite's lightningcss lowers light-dark() into --lightningcss-light/--lightningcss-dark toggles, so the custom property
    // reads back as that unresolved text: the resolved colour is read from the body's computed background-color
    const background = async (): Promise<string> =>
      rgbString(
        await rgbOf(
          page,
          await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
        ),
      );
    expect(await background()).toBe('rgb(252, 252, 254)');
    await page.locator('.VPSwitchAppearance').first().click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect.poll(background).toBe('rgb(10, 14, 39)');
    // transitionAppearance skips the view transition under reduced motion (canTransition in view-transitions.ts) and flips at once
    expect(await viewTransitions(page)).toBe(0);
  });

  it('the appearance switch flips through exactly one view transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await chooseScheme(page, 'light');
    await countViewTransitions(page);
    await page.goto('');
    await page.locator(HYDRATED).waitFor();
    expect(await viewTransitions(page)).toBe(0);
    await page.locator('.VPSwitchAppearance').first().click();
    await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 5000 });
    await expect
      .poll(
        async () =>
          rgbString(
            await rgbOf(
              page,
              await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
            ),
          ),
        {
          timeout: 5000,
        },
      )
      .toBe('rgb(10, 14, 39)');
    expect(await viewTransitions(page)).toBe(1);
  });
});

it.describe('without JavaScript', () => {
  it.use({ javaScriptEnabled: false });

  it('the hero palette is seven real links and the first one navigates', async ({ page }) => {
    await page.goto('');
    const links = page.locator('[data-mc="palette"] a[href]');
    await expect(links).toHaveCount(7);
    await links.first().click();
    await page.waitForURL('**/modern-cmdk/guide/getting-started.html');
  });

  it('the install radios switch the visible command', async ({ page }) => {
    await page.goto('');
    const install = page.locator('[data-mc="install"]');
    const shown = (manager: string): Locator => install.locator(`.command[data-pm="${manager}"]`);
    await expect(shown('pnpm')).toBeVisible();
    await expect(shown('npm')).toBeHidden();
    await install.locator('label.manager', { hasText: /^npm$/ }).click();
    await expect(shown('npm')).toBeVisible();
    await expect(shown('pnpm')).toBeHidden();
    await install.locator('label.manager', { hasText: /^yarn$/ }).click();
    await expect(shown('yarn')).toBeVisible();
    await expect(shown('npm')).toBeHidden();
  });
});

it.describe('layout shift', () => {
  // The budget is design-final.md 8: CLS on home load and through the first autoplay cycle at most 0.02
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    it(`CLS stays at or below 0.02 at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      it.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.addInitScript(() => {
        const state = { cls: 0 };
        Reflect.set(window, '__cls', state);
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!shift.hadRecentInput) state.cls += shift.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto('');
      const palette = page.locator('[data-mc="palette"]').first();
      await palette.waitFor();
      // below 960 px the panel sits under the text; autoplay needs it half visible, as a visitor scrolling would make it
      await palette.scrollIntoViewIfNeeded();
      await expect(palette).toHaveAttribute('data-autoplay', /.*/, { timeout: 15_000 });
      // the first cycle types frec, short and dark in turn; the third word is on screen, then it clears
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLInputElement>('[data-mc="palette-input"]')?.value === 'dark',
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(2500);
      const cls = await page.evaluate(() => (Reflect.get(window, '__cls') as { cls: number }).cls);
      expect(cls, `cumulative layout shift ${cls}`).toBeLessThanOrEqual(0.02);
    });
  }
});
