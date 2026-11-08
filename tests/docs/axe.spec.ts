import AxeBuilder from '@axe-core/playwright';
import { expect, test as it, type Page } from '@playwright/test';

// axe-core over the pages the redesign changed (design-final.md 8), light and dark, against `vitepress preview`.
// The run uses reduced motion: the home sections reveal on scroll (opacity 0.001 to 1 under `animation-timeline: view()`,
// motion.css), and axe measures the colour of text that is half revealed; with reduced motion they are painted in full,
// which is what a visitor who has not scrolled yet has no way to read anyway.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PAGES = [
  { name: 'home', path: '' },
  { name: 'guide/getting-started', path: 'guide/getting-started.html' },
  { name: 'api/command', path: 'api/command.html' },
  { name: '404', path: 'guide/frecncy.html' },
] as const;
const SCHEMES = ['light', 'dark'] as const;

async function open(page: Page, path: string, scheme: (typeof SCHEMES)[number]): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
  await page.addInitScript(
    (value) => localStorage.setItem('vitepress-theme-appearance', value),
    scheme,
  );
  await page.goto(path);
  // the palette on the home page and on the 404 is hydrated before it is measured
  if (path === '' || path === 'guide/frecncy.html') {
    await page.locator('[data-mc="palette"][data-hydrated]').waitFor();
  }
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*dark)/);
}

function summary(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']): string[] {
  return violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );
}

for (const entry of PAGES) {
  for (const scheme of SCHEMES) {
    it(`${entry.name} has no axe violations (${scheme})`, async ({ page }) => {
      await open(page, entry.path, scheme);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(summary(results.violations)).toEqual([]);
    });
  }
}

for (const path of ['benchmarks.html', 'examples/basic.html']) {
  for (const scheme of SCHEMES) {
    it(`${path} passes color-contrast (${scheme})`, async ({ page }) => {
      await open(page, path, scheme);
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect(summary(results.violations)).toEqual([]);
    });
  }
}
