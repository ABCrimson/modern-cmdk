import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

// The built library stylesheet (packages/modern-cmdk/dist/react/styles.css), asserted through
// computed styles and layout. Two kinds of case:
// - playground cases open the real Command.Dialog and its Radix portal on /dialog;
// - bare-page cases inject the built file after a host stylesheet whose rules sit in `@layer host`
//   (declared first, so the lowest layer), where the playground's own stylesheet would mask the
//   library. Playwright resolves the relative path against the working directory (the repo root).

const STYLESHEET = 'packages/modern-cmdk/dist/react/styles.css';

/** The 20 user-customizable tokens the stylesheet defines. */
const TOKENS = [
  '--command-spring-easing',
  '--command-spring-easing-bouncy',
  '--command-easing-exit',
  '--command-duration-enter',
  '--command-duration-enter-scale',
  '--command-duration-exit',
  '--command-duration-item',
  '--command-duration-list',
  '--command-duration-page',
  '--command-duration-loading',
  '--command-scale-from',
  '--command-translate-from',
  '--command-overlay-blur',
  '--command-dialog-radius',
  '--command-dialog-max-width',
  '--command-dialog-max-height',
  '--command-item-height',
  '--command-fade-edge-size',
  '--command-highlight-color',
  '--command-muted-color',
] as const;

/** Chromium serializes the reduced-motion clamp of 0.01ms in seconds. */
const CLAMPED_DURATION = '1e-05s';

const DIALOG = '[data-command-dialog]';
const OVERLAY = '[data-command-overlay]';
const DIALOG_CONTENT = '[data-command-dialog-content]';

/** What the exit observer of `observeExit` records, in `performance.now()` milliseconds. */
interface ExitRecord {
  /** The Escape keydown that asks the dialog to close. */
  escapeAt: number | null;
  /** The first mutation after which `[data-command-dialog]` carries `data-state="closed"`. */
  closedAt: number | null;
  /** The first mutation after which `[data-command-dialog]` is no longer in the document. */
  removedAt: number | null;
  /** Names of the running CSSAnimations of the dialog node when it first reads closed. */
  dialogAnimations: string[];
  /** Names of the running CSSAnimations of the overlay node when the dialog first reads closed. */
  overlayAnimations: string[];
}

declare global {
  interface Window {
    __cmdkExit?: ExitRecord;
  }
}

/**
 * Loads a document whose host stylesheet sits in `@layer host`, then the built library stylesheet.
 */
async function bareDocument(
  page: Page,
  { host = '', body }: { host?: string; body: string },
): Promise<void> {
  await page.setContent(
    `<!doctype html><html><head><style>@layer host { ${host} }</style></head><body>${body}</body></html>`,
  );
  await page.addStyleTag({ path: STYLESHEET });
}

/** The computed value of one property (kebab-case) of the first element matching `selector`. */
async function computed(
  page: Page,
  selector: string,
  property: string,
  pseudo: '::before' | '::after' | null = null,
): Promise<string> {
  return page.evaluate(
    ({ query, name, pseudoElement }) => {
      const element = document.querySelector(query);
      if (element === null) throw new Error(`no element matches ${query}`);
      return getComputedStyle(element, pseudoElement).getPropertyValue(name);
    },
    { query: selector, name: property, pseudoElement: pseudo },
  );
}

/**
 * Opens the playground's dialog demo and waits until the open transition has finished. `css` is
 * added to the page, unlayered, before the dialog opens.
 */
async function openDialog(page: Page, css?: string): Promise<void> {
  await open(page, '/dialog');
  if (css !== undefined) await page.addStyleTag({ content: css });
  await page.locator('[data-command-trigger]').click();
  await expect(page.locator(`${DIALOG}[data-state="open"]`)).toBeVisible();
  await expect(page.locator(DIALOG_CONTENT)).toBeVisible();
  await page.evaluate(async () => {
    const nodes = [
      document.querySelector('[data-command-dialog]'),
      document.querySelector('[data-command-overlay]'),
    ];
    for (const node of nodes) {
      if (node === null) throw new Error('the dialog is not mounted');
      await Promise.all(node.getAnimations().map((animation) => animation.finished));
    }
  });
}

/** The used `inline-size` of an element in pixels. */
async function inlineSize(page: Page, selector: string): Promise<number> {
  return Number.parseFloat(await computed(page, selector, 'inline-size'));
}

/**
 * Installs the exit observer on the open dialog: records when `[data-command-dialog]` first reads
 * `data-state="closed"` (with the running CSSAnimations of the dialog and the overlay at that
 * moment) and when it leaves the document. The results sit on `window.__cmdkExit`.
 */
async function observeExit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const dialog = document.querySelector('[data-command-dialog]');
    const overlay = document.querySelector('[data-command-overlay]');
    if (dialog === null || overlay === null) throw new Error('the dialog is not mounted');
    const record: ExitRecord = {
      escapeAt: null,
      closedAt: null,
      removedAt: null,
      dialogAnimations: [],
      overlayAnimations: [],
    };
    const cssAnimationNames = (node: Element): string[] =>
      node
        .getAnimations()
        .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
        .map((animation) => animation.animationName);
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && record.escapeAt === null) record.escapeAt = performance.now();
      },
      { capture: true },
    );
    const observer = new MutationObserver(() => {
      const now = performance.now();
      if (record.closedAt === null && dialog.getAttribute('data-state') === 'closed') {
        record.closedAt = now;
        record.dialogAnimations = cssAnimationNames(dialog);
        record.overlayAnimations = cssAnimationNames(overlay);
      }
      if (record.removedAt === null && !dialog.isConnected) record.removedAt = now;
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
    window.__cmdkExit = record;
  });
}

/** Presses Escape and returns the exit record once the dialog has left the document. */
async function closeAndRecord(page: Page): Promise<ExitRecord> {
  await observeExit(page);
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => window.__cmdkExit?.removedAt ?? null), {
      message: 'the dialog leaves the document',
    })
    .not.toBeNull();
  const record = await page.evaluate(() => window.__cmdkExit);
  if (record === undefined) throw new Error('the exit observer was not installed');
  return record;
}

/** Pauses every animation of the page at time 0, so a keyframe's `from` values are the computed ones. */
async function pauseAtStart(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
}

/** Relative luminance (WCAG) of an `rgb()`/`rgba()` computed colour; throws on any other format. */
function luminance(color: string): number {
  const match =
    /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?%?))?\s*\)$/.exec(
      color,
    );
  if (match === null) throw new Error(`not an rgb() or rgba() colour: ${color}`);
  const alpha = match[4];
  if (alpha !== undefined && alpha !== '1' && alpha !== '100%') {
    throw new Error(`not an opaque colour: ${color}`);
  }
  const [r = 0, g = 0, b = 0] = [match[1], match[2], match[3]].map((text) => {
    const value = Number.parseFloat(text ?? '0') / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two computed colours. */
function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

test.describe('Stylesheet — Command.Dialog in the playground', {
  tag: ['@styles', '@dialog'],
}, () => {
  test('A11Y-01: Command.Dialog lays out wider than 300 px', async ({ page }) => {
    await openDialog(page);
    const width = await page
      .locator(DIALOG_CONTENT)
      .evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(300);
  });

  test('A11Y-01: Command.Dialog lays out at its token max width', async ({ page }) => {
    await openDialog(page);
    expect(await computed(page, DIALOG_CONTENT, '--command-dialog-max-width')).toBe('640px');
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(await inlineSize(page, DIALOG_CONTENT)).toBe(Math.min(640, viewportWidth - 32));
  });

  test('DT-19: the dialog, overlay and content resolve every --command token', async ({ page }) => {
    await openDialog(page);
    for (const selector of [OVERLAY, DIALOG, DIALOG_CONTENT]) {
      const missing = await page
        .locator(selector)
        .evaluate(
          (node, names) =>
            names.filter((name) => getComputedStyle(node).getPropertyValue(name).trim() === ''),
          [...TOKENS],
        );
      expect(missing, `tokens missing on ${selector}`).toEqual([]);
    }
  });

  test('RA-31: a :root token override reaches the dialog', async ({ page }) => {
    await openDialog(page, ':root { --command-dialog-max-width: 420px; }');
    expect(await inlineSize(page, DIALOG_CONTENT)).toBe(420);
    expect(await computed(page, '[data-command-root]', '--command-dialog-max-width')).toBe('420px');
  });
});

test.describe('Stylesheet — the dialog exit', { tag: ['@styles', '@dialog'] }, () => {
  test.use({ reducedMotion: 'no-preference' });

  test('RA-11: the closed dialog stays mounted until its exit animation ends', async ({ page }) => {
    await openDialog(page);
    const record = await closeAndRecord(page);
    const closedAt = record.closedAt ?? record.escapeAt;
    if (closedAt === null || record.removedAt === null)
      throw new Error('the exit was not recorded');
    // The exit token is 150 ms; the node has to outlive the close by most of it
    expect(
      record.removedAt - closedAt,
      'milliseconds between closed and removed',
    ).toBeGreaterThanOrEqual(100);
  });

  test('RA-11: Command.Dialog plays its exit animation before unmounting', async ({ page }) => {
    await openDialog(page);
    const record = await closeAndRecord(page);
    expect(record.dialogAnimations, 'CSSAnimations of the closed dialog').not.toEqual([]);
    expect(record.overlayAnimations, 'CSSAnimations of the closed overlay').not.toEqual([]);
  });
});

test.describe('Stylesheet — bare page', { tag: '@styles' }, () => {
  test("RA-10: the overlay's backdrop blur and the dialog radius apply", async ({ page }) => {
    await bareDocument(page, {
      body: `<div data-command-overlay data-state="open"></div>
        <div data-command-dialog data-state="open"><div data-command-dialog-content></div></div>`,
    });
    expect(await computed(page, OVERLAY, 'backdrop-filter')).toBe('blur(4px)');
    expect(await computed(page, DIALOG_CONTENT, 'border-radius')).toBe('12px');
  });

  test('RA-12: reduced motion leaves an element outside the palette at its own transition duration', async ({
    page,
  }) => {
    await bareDocument(page, {
      host: '#host { transition: opacity 300ms linear; }',
      body: '<div id="host"></div>',
    });
    expect(await computed(page, '#host', 'transition-duration')).toBe('0.3s');
  });

  test("RA-12: the reduced-motion rule leaves the host page's transitions alone", async ({
    page,
  }) => {
    await bareDocument(page, {
      host: `
        #plain, #button, #pseudo, #pseudo::before, #sibling, #inner, #inner::before {
          transition-duration: 300ms;
          animation-duration: 2s;
        }
        #pseudo::before, #inner::before { content: "x"; }
        #root, #dialog, #overlay { transition-duration: 300ms; animation-duration: 2s; }`,
      body: `
        <div id="plain"></div>
        <button id="button" type="button"></button>
        <div id="pseudo"></div>
        <div id="overlay" data-command-overlay></div>
        <div id="sibling"></div>
        <div id="root" data-command-root><div id="inner"></div></div>
        <div id="dialog" data-command-dialog></div>`,
    });
    const outside: Array<[string, '::before' | null]> = [
      ['#plain', null],
      ['#button', null],
      ['#pseudo', '::before'],
      ['#sibling', null],
    ];
    for (const [selector, pseudo] of outside) {
      const label = `${selector}${pseudo ?? ''}`;
      expect(
        await computed(page, selector, 'transition-duration', pseudo),
        `${label} transition`,
      ).toBe('0.3s');
      expect(
        await computed(page, selector, 'animation-duration', pseudo),
        `${label} animation`,
      ).toBe('2s');
    }
    const inside: Array<[string, '::before' | null]> = [
      ['#root', null],
      ['#dialog', null],
      ['#overlay', null],
      ['#inner', null],
      ['#inner', '::before'],
    ];
    for (const [selector, pseudo] of inside) {
      const label = `${selector}${pseudo ?? ''}`;
      expect(
        await computed(page, selector, 'transition-duration', pseudo),
        `${label} transition`,
      ).toBe(CLAMPED_DURATION);
      expect(
        await computed(page, selector, 'animation-duration', pseudo),
        `${label} animation`,
      ).toBe(CLAMPED_DURATION);
    }
  });

  test("A11Y-25: the active item's indicator reaches 3:1 in both themes", async ({ page }) => {
    await bareDocument(page, {
      host: `
        :root { color-scheme: light dark; }
        body { margin: 0; background: Canvas; color: CanvasText; }`,
      body: `<div data-command-root><div data-command-list>
        <div id="active" data-command-item data-active>Alpha</div>
        <div id="inactive" data-command-item>Beta</div>
      </div></div>`,
    });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const background = await computed(page, 'body', 'background-color');
      expect(
        await computed(page, '#active', 'outline-style'),
        `${colorScheme} outline-style`,
      ).not.toBe('none');
      expect(
        Number.parseFloat(await computed(page, '#active', 'outline-width')),
        `${colorScheme} outline-width`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        contrast(await computed(page, '#active', 'outline-color'), background),
        `${colorScheme} contrast of the outline against ${background}`,
      ).toBeGreaterThanOrEqual(3);
      expect(await computed(page, '#inactive', 'outline-style'), `${colorScheme} inactive`).toBe(
        'none',
      );
    }
  });

  test("RC-2: the scroll indicator's transform-origin is left center, right center under dir=rtl", async ({
    page,
  }) => {
    await bareDocument(page, {
      body: `
        <div style="inline-size: 200px"><div id="ltr" data-command-scroll-indicator></div></div>
        <div dir="rtl" style="inline-size: 200px"><div id="rtl" data-command-scroll-indicator></div></div>`,
    });
    // The indicator is 2 px tall, so "center" is 1px
    expect(await computed(page, '#ltr', 'transform-origin')).toBe('0px 1px');
    expect(await computed(page, '#rtl', 'transform-origin')).toBe('200px 1px');
  });

  test('RC-2: the scroll indicator grows from the inline start', async ({ page }) => {
    await bareDocument(page, {
      body: `
        <div id="ltr-box" style="inline-size: 200px">
          <div id="ltr" data-command-scroll-indicator style="animation: none; scale: 0.5 1"></div>
        </div>
        <div id="rtl-box" dir="rtl" style="inline-size: 200px">
          <div id="rtl" data-command-scroll-indicator style="animation: none; scale: 0.5 1"></div>
        </div>`,
    });
    const rect = (selector: string): Promise<{ left: number; right: number }> =>
      page.locator(selector).evaluate((node) => {
        const { left, right } = node.getBoundingClientRect();
        return { left, right };
      });
    const [ltr, ltrBox, rtl, rtlBox] = await Promise.all([
      rect('#ltr'),
      rect('#ltr-box'),
      rect('#rtl'),
      rect('#rtl-box'),
    ]);
    expect(ltr.left, 'LTR indicator starts at its container left edge').toBeCloseTo(ltrBox.left, 1);
    expect(rtl.right, 'RTL indicator ends at its container right edge').toBeCloseTo(
      rtlBox.right,
      1,
    );
  });

  test.describe('with motion', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('A11Y-33: the page-enter slide follows dir=rtl', async ({ page }) => {
      await bareDocument(page, {
        body: `
          <div data-command-root><div id="ltr" data-command-page style="animation-play-state: paused"></div></div>
          <div dir="rtl"><div data-command-root><div id="rtl" data-command-page style="animation-play-state: paused"></div></div></div>`,
      });
      await pauseAtStart(page);
      const slide = async (selector: string): Promise<number> =>
        Number.parseFloat((await computed(page, selector, 'translate')).split(' ')[0] ?? '');
      const ltr = await slide('#ltr');
      expect(ltr, 'LTR slide starts at the positive translate-from').toBeGreaterThan(0);
      expect(await slide('#rtl'), 'RTL slide is the mirror image').toBe(-ltr);
    });

    test('A11Y-40: the loading status text stays at opacity 1 while its indicator pulses', async ({
      page,
    }) => {
      await bareDocument(page, {
        body: `<div data-command-root>
          <div id="loading" data-command-loading style="animation-play-state: paused">Loading</div>
        </div>`,
      });
      await pauseAtStart(page);
      expect(await computed(page, '#loading', 'opacity')).toBe('1');
      expect(await computed(page, '#loading', 'animation-name', '::before')).toBe(
        'command-loading-pulse',
      );
    });
  });

  test('A11Y-37: a match carries an underline, and forced colors paint it Mark on MarkText', async ({
    page,
  }) => {
    await bareDocument(page, {
      body: `<div data-command-root><span id="match" data-command-highlight>match</span></div>
        <span id="probe" style="background-color: Mark; color: MarkText">probe</span>`,
    });
    expect(await computed(page, '#match', 'text-decoration-line')).toContain('underline');
    expect(await computed(page, '#match', 'text-decoration-thickness')).toBe('1px');
    // types.d.ts documents `forcedColors?: null|"active"|"none"` on emulateMedia without an engine
    // restriction (playwright-core types.d.ts:2809), and the driver implements it for Chromium,
    // Firefox and WebKit, so no engine is skipped
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await computed(page, '#match', 'background-color')).toBe(
      await computed(page, '#probe', 'background-color'),
    );
    expect(await computed(page, '#match', 'color')).toBe(await computed(page, '#probe', 'color'));
  });

  test('RA-52: the fade edges take no scroll space', async ({ page }) => {
    await bareDocument(page, {
      // The root carries the fade edge size token on the base build
      body: `<div data-command-root><div id="list" data-command-list style="block-size: 100px">
        <div data-command-list-inner>
          ${'<div data-command-item style="block-size: 40px">Row</div>'.repeat(5)}
        </div>
      </div></div>`,
    });
    const { listTop, itemTop, scrollHeight } = await page.evaluate(() => {
      const list = document.querySelector('#list');
      const item = document.querySelector('[data-command-item]');
      if (list === null || item === null) throw new Error('the list is not rendered');
      return {
        listTop: list.getBoundingClientRect().top,
        itemTop: item.getBoundingClientRect().top,
        scrollHeight: list.scrollHeight,
      };
    });
    expect(itemTop, 'first item top against the list top').toBe(listTop);
    expect(scrollHeight).toBe(200);
  });

  test('PKG-10: the built stylesheet keeps the scroll timeline on the fade edges and the scroll indicator', async ({
    page,
  }) => {
    await bareDocument(page, {
      body: `<div id="list" data-command-list style="block-size: 100px">
        <div id="indicator" data-command-scroll-indicator></div>
      </div>`,
    });
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()'));
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on engine support, not a disabled test
    test.skip(
      !supported,
      'this engine lacks animation-timeline, so the stylesheet wires no timeline',
    );
    expect(await computed(page, '#list', 'animation-timeline', '::before')).toBe('--list-scroll');
    expect(await computed(page, '#list', 'animation-timeline', '::after')).toBe('--list-scroll');
    expect(await computed(page, '#indicator', 'animation-timeline')).toBe('--list-scroll');
  });
});
