import { expect, test as it } from '@playwright/test';

// Judge finding 4 (second round): the API tables clip instead of squeeze. A `.vp-doc table` is its own scroll container
// (display: block; overflow-x: auto under the edge fade), so a table that scrolls cuts a description mid-word.
// Run `pnpm docs:build` first: this serves apps/docs/.vitepress/dist like the other docs specs.

const MAX_ROW_HEIGHT = 160;

interface TableReport {
  readonly tables: number;
  readonly overflowing: readonly string[];
  readonly widestOverflow: number;
  readonly tallestRow: number;
  readonly tallestRowText: string;
}

for (const route of ['api/command-react', 'api/command']) {
  for (const width of [1280, 1440, 1920]) {
    it(`${route}: no table scrolls and no row exceeds ${MAX_ROW_HEIGHT} px at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${route}.html`);
      await page.evaluate(() => document.fonts.ready);
      const report = await page.evaluate((): TableReport => {
        const tables = [...document.querySelectorAll<HTMLTableElement>('.vp-doc table')];
        const overflowing: string[] = [];
        let widestOverflow = 0;
        let tallestRow = 0;
        let tallestRowText = '';
        tables.forEach((table, index) => {
          const excess = table.scrollWidth - table.clientWidth;
          if (excess > 1) {
            overflowing.push(`#${index + 1} +${excess}px`);
            widestOverflow = Math.max(widestOverflow, excess);
          }
          for (const row of table.querySelectorAll('tr')) {
            const height = row.getBoundingClientRect().height;
            if (height > tallestRow) {
              tallestRow = Math.round(height);
              tallestRowText = `#${index + 1} ${row.firstElementChild?.textContent ?? ''}`;
            }
          }
        });
        return { tables: tables.length, overflowing, widestOverflow, tallestRow, tallestRowText };
      });
      expect(report.tables, 'tables found').toBeGreaterThan(0);
      expect(report.overflowing, 'tables that scroll').toEqual([]);
      expect(report.tallestRow, `tallest row (${report.tallestRowText})`).toBeLessThanOrEqual(
        MAX_ROW_HEIGHT,
      );
    });

    it(`${route}: no identifier in a Type or Default cell breaks across lines at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${route}.html`);
      await page.evaluate(() => document.fonts.ready);
      // A word of a code span (text between whitespace; the cell may wrap between words) laid out on two lines has two client
      // rects: that is a break inside an identifier, which overflow-wrap: anywhere allows as a last resort.
      const broken = await page.evaluate((): string[] => {
        const found: string[] = [];
        const cells = document.querySelectorAll('.vp-doc td:not(:first-child, :last-child) code');
        for (const code of cells) {
          const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            for (const word of node.textContent?.matchAll(/\S+/g) ?? []) {
              const range = document.createRange();
              range.setStart(node, word.index);
              range.setEnd(node, word.index + word[0].length);
              if (range.getClientRects().length > 1) found.push(word[0]);
            }
          }
        }
        return found;
      });
      expect(broken, 'identifiers split across lines').toEqual([]);
    });
  }
}
