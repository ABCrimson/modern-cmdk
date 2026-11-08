import { expect, test as it, type Page } from '@playwright/test';

// The judge's visual findings of the fix round (judge-visual.md 1, 3, 7, 8) as computed-style checks on the built site.
// Run `pnpm docs:build` first: this serves apps/docs/.vitepress/dist like the other docs specs.

let pageErrors: string[] = [];
it.beforeEach(({ page }) => {
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
it.afterEach(() => {
  expect(pageErrors, 'uncaught page errors').toEqual([]);
});

/** The used font size of `var(--mc-step-N)` in px, read from a probe element so clamp() and rem resolve like the hero's. */
async function stepSize(page: Page, step: 4 | 5): Promise<number> {
  return page.evaluate((token) => {
    const probe = document.createElement('span');
    probe.style.fontSize = `var(${token})`;
    probe.style.position = 'absolute';
    document.body.append(probe);
    const size = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return size;
  }, `--mc-step-${step}`);
}

it.describe('hero type scale (audit C5)', () => {
  for (const width of [1440, 390]) {
    it(`the wordmark is step 5 and the headline step 4 at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('');
      const name = await page
        .locator('.VPHero .name')
        .first()
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
      const text = await page
        .locator('.VPHero .text')
        .first()
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
      expect(name).toBe(await stepSize(page, 5));
      expect(text).toBe(await stepSize(page, 4));
      expect(name, 'the wordmark outranks the headline').toBeGreaterThan(text);
    });
  }

  it('the wordmark does not wrap at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('');
    const lines = await page
      .locator('.VPHero .name')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return Math.round(el.getBoundingClientRect().height / Number.parseFloat(style.lineHeight));
      });
    expect(lines).toBe(1);
  });
});

it.describe('focus rings (audit finding 3)', () => {
  it('the hero palette input draws no square outline; the frame lights up instead', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('');
    await page.locator('[data-mc="palette"][data-hydrated]').waitFor();
    const input = page.locator('[data-mc="palette-input"]');
    const frame = page.locator('[data-mc="palette"] .mc-frame').first();
    const rest = await frame.evaluate((el) => {
      const style = getComputedStyle(el);
      return { border: style.borderColor, shadow: style.boxShadow };
    });
    await input.click();
    await expect(input).toBeFocused();
    expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
    // the frame carries the state: another border colour and a wider shadow stack (the 3 px halo)
    const focused = await frame.evaluate((el) => {
      const style = getComputedStyle(el);
      return { border: style.borderColor, shadow: style.boxShadow };
    });
    expect(focused.border).not.toBe(rest.border);
    expect(focused.shadow).not.toBe(rest.shadow);
  });

  it('the local search box draws no square outline on its input', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('guide/getting-started.html');
    await page.locator('.VPNavBarSearchButton').click();
    const input = page.locator('.VPLocalSearchBox .search-input');
    await expect(input).toBeFocused();
    expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  });
});

it.describe('scroll reveal on a phone (audit finding 7)', () => {
  it('a feature card fully inside the viewport is opaque, with every ancestor counted', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('');
    await page.locator('[data-mc="palette"][data-hydrated]').waitFor();
    const card = page.locator('.VPFeatures .item').first();
    await card.scrollIntoViewIfNeeded();
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    // scroll-driven animations advance on the compositor; give the frame a moment to settle
    await page.waitForTimeout(300);
    const { inside, opacity } = await card.evaluate((el) => {
      const box = el.getBoundingClientRect();
      let product = 1;
      for (let node: Element | null = el; node; node = node.parentElement) {
        product *= Number.parseFloat(getComputedStyle(node).opacity);
      }
      return {
        inside: box.top >= 0 && box.bottom <= window.innerHeight,
        opacity: product,
      };
    });
    expect(inside, 'the card sits fully inside the 390 x 844 viewport').toBe(true);
    expect(opacity).toBe(1);
  });
});

it.describe('code group tabs (WCAG 2.4.7)', () => {
  it('the focused tab shows an outline when reached with the keyboard', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('guide/installation.html');
    const input = page.locator('.vp-code-group .tabs input').first();
    await expect(input).toHaveCount(1);
    let focused = false;
    for (let press = 0; press < 80 && !focused; press++) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(
        () => document.activeElement?.matches('.vp-code-group .tabs input') ?? false,
      );
    }
    expect(focused, 'Tab reaches a code-group radio').toBe(true);
    const outline = await page.evaluate(() => {
      const active = document.activeElement as HTMLInputElement;
      const label = active.nextElementSibling as HTMLElement;
      const style = getComputedStyle(label);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });
});
