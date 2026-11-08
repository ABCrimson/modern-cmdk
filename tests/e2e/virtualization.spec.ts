import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

// Locator-first assertions, toBeInViewport()
// 2000 items: well above the 100-item virtualization threshold,
// fast enough for parallel E2E workers (10K hangs the browser).
const virtualizationUrl = '/virtualization?count=2000';

test.describe('Virtualization — Large Item Set', { tag: '@virtual' }, () => {
  test.beforeEach(async ({ page }) => {
    await open(page, virtualizationUrl);
    // Wait for hydration using locator-first pattern
    await expect(page.locator('[data-command-root]')).toBeVisible();
    await expect(page.locator('[data-command-item]').first()).toBeVisible();
  });

  // ---------- DOM Node Count ----------

  test('should render large item set with fewer than 100 DOM nodes', async ({ page }) => {
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    // With virtualization, only items in the viewport + overscan should be in the DOM
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(100);
  });

  test('should not render all items in the DOM simultaneously', async ({ page }) => {
    // Verify the total rendered item count is dramatically less than total
    const itemCount = await page.locator('[data-command-item]').count();
    expect(itemCount).toBeLessThan(200);

    // The list container should exist and contain items
    const list = page.locator('[data-command-list]');
    await expect(list).toBeVisible();
  });

  test('should have correct ARIA roles on virtualized list', async ({ page }) => {
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    const options = page.getByRole('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);

    // Each visible option should have proper ARIA attributes
    const firstOption = options.first();
    await expect(firstOption).toHaveAttribute('role', 'option');
    await expect(firstOption).toHaveAttribute('data-command-item', '');
  });

  // ---------- Scroll Down ----------

  test('should render new items when scrolling down', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Get IDs of initially visible items
    const initialItems = await page.locator('[data-command-item]').allTextContents();

    // Scroll down significantly
    await list.evaluate((el) => {
      el.scrollTop = 5_000;
    });

    // Wait for virtualized content to actually change (auto-retrying poll)
    const initialSet = new Set(initialItems);
    await expect
      .poll(async () => {
        const currentItems = await page.locator('[data-command-item]').allTextContents();
        const overlap = currentItems.filter((item) => initialSet.has(item));
        return overlap.length < initialItems.length;
      })
      .toBeTruthy();
  });

  test('should still limit DOM nodes after scrolling down', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Scroll to middle of list
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });

    // Locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    const itemCount = await page.locator('[data-command-item]').count();
    expect(itemCount).toBeLessThan(100);
    expect(itemCount).toBeGreaterThan(0);
  });

  // ---------- Scroll Up ----------

  test('should render correct items when scrolling back up', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Get initial items
    const initialItems = await page.locator('[data-command-item]').allTextContents();

    // Scroll down and wait for content to change
    const initialSet = new Set(initialItems);
    await list.evaluate((el) => {
      el.scrollTop = 5_000;
    });
    await expect
      .poll(async () => {
        const items = await page.locator('[data-command-item]').allTextContents();
        return items.some((item) => !initialSet.has(item));
      })
      .toBeTruthy();

    // Scroll back to top and wait for content to restore
    await list.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect
      .poll(async () => {
        const items = await page.locator('[data-command-item]').allTextContents();
        return JSON.stringify(items) === JSON.stringify(initialItems);
      })
      .toBeTruthy();
  });

  test('should maintain DOM node budget after scroll up/down cycle', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Scroll down
    await list.evaluate((el) => {
      el.scrollTop = 3_000;
    });
    // Locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Scroll further down
    await list.evaluate((el) => {
      el.scrollTop = 8_000;
    });
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Scroll back up
    await list.evaluate((el) => {
      el.scrollTop = 1_000;
    });
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    const count = await page.locator('[data-command-item]').count();
    expect(count).toBeLessThan(100);
    expect(count).toBeGreaterThan(0);
  });

  // ---------- Scroll to Bottom ----------

  test('should render last items when scrolled to the very bottom', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Scroll to the very bottom
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    // Locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    const items = page.locator('[data-command-item]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(100);
  });

  // ---------- Keyboard Navigation in Virtualized List ----------

  test('should navigate with ArrowDown in virtualized list', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Navigate down multiple items
    for (let i = 0; i < 10; i++) {
      await input.press('ArrowDown');
    }

    // An item should still be active
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);
    await expect(activeItem).toHaveAttribute('aria-selected', 'true');
  });

  test('should navigate with ArrowUp in virtualized list', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Navigate down first
    for (let i = 0; i < 5; i++) {
      await input.press('ArrowDown');
    }

    // Navigate back up
    for (let i = 0; i < 3; i++) {
      await input.press('ArrowUp');
    }

    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);
  });

  test('should jump to first item with Home in virtualized list', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Navigate down significantly
    for (let i = 0; i < 20; i++) {
      await input.press('ArrowDown');
    }

    // Press Home
    await input.press('Home');

    // First item should be active
    const items = page.locator('[data-command-item]');
    const firstItem = items.first();
    await expect(firstItem).toHaveAttribute('data-active', '');
  });

  test('should jump to last item with End in virtualized list', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Press End — should go to last item
    await input.press('End');

    // An item should be active
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);

    // The DOM node count should still be bounded
    const totalDomItems = await page.locator('[data-command-item]').count();
    expect(totalDomItems).toBeLessThan(100);
  });

  // ---------- Scroll-to-Active on Keyboard Navigation ----------

  test('should scroll active item into view when pressing End', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const list = page.locator('[data-command-list]');

    await input.press('End');

    // Active item should be visible
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);

    // Wait for scroll to settle near the bottom (auto-retrying poll)
    await expect
      .poll(async () => {
        const scrollTop = await list.evaluate((el) => el.scrollTop);
        const scrollHeight = await list.evaluate((el) => el.scrollHeight);
        const clientHeight = await list.evaluate((el) => el.clientHeight);
        return scrollTop + clientHeight > scrollHeight - 100;
      })
      .toBeTruthy();
  });

  test.describe('TEB-17: virtualization scroll positions are read with expect.poll', () => {
    test('should scroll the active item into view during keyboard navigation', async ({ page }) => {
      const input = page.getByRole('combobox');
      await input.focus();
      const list = page.locator('[data-command-list]');

      // Navigate down enough to require scrolling
      for (let i = 0; i < 30; i++) {
        await input.press('ArrowDown');
      }

      // The list scrolls after the key presses: poll the position (it starts at 0)
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

      // The active item lies inside the list's own viewport (the list's bottom edge can sit below the page's)
      const activeItem = page.locator('[data-command-item][data-active]');
      await expect(activeItem).toBeVisible();
      await expect
        .poll(async () => {
          const [row, view] = await Promise.all([
            activeItem.evaluate((el) => el.getBoundingClientRect()),
            list.evaluate((el) => el.getBoundingClientRect()),
          ]);
          return row.top >= view.top && row.bottom <= view.bottom;
        })
        .toBe(true);
    });

    test('TEB-17: scrollTop polls after End then Home', async ({ page }) => {
      const input = page.getByRole('combobox');
      await input.focus();

      const list = page.locator('[data-command-list]');

      // Go to the end: the list leaves the top
      await input.press('End');
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);

      // Go back to the beginning: the list returns near the top
      await input.press('Home');
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeLessThan(100);

      // Active item (first) should be visible
      const activeItem = page.locator('[data-command-item][data-active]');
      await expect(activeItem).toBeVisible();
    });
  });

  // ---------- Filtering in Virtualized List ----------

  test('should filter items and maintain virtualization', async ({ page }) => {
    const input = page.getByRole('combobox');

    // Type a search query
    await input.pressSequentially('item 5', { delay: 50 });

    // Locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Items should be filtered
    const filteredCount = await page.locator('[data-command-item]').count();
    expect(filteredCount).toBeGreaterThan(0);
    // Should still be virtualized (not showing all matching items)
    expect(filteredCount).toBeLessThan(200);
  });

  test('should clear filter and restore full virtualized list', async ({ page }) => {
    const input = page.getByRole('combobox');
    const initialCount = await page.locator('[data-command-item]').count();

    // Filter
    await input.pressSequentially('item 5', { delay: 50 });
    // Locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Clear
    await input.press('Control+a');
    await input.press('Backspace');
    // Locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Should return to approximately the same DOM count
    const afterClearCount = await page.locator('[data-command-item]').count();
    expect(afterClearCount).toBe(initialCount);
  });

  // ---------- Performance ----------

  test('should render initial list within acceptable time', async ({ page }) => {
    // Navigate to the virtualization page and measure performance
    const startTime = Date.now();

    await open(page, virtualizationUrl);
    await expect(page.locator('[data-command-root]')).toBeVisible();
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    const elapsed = Date.now() - startTime;

    // Initial render should complete within 5 seconds (the page loads 2,000 items: virtualizationUrl sets count=2000 in every run)
    expect(elapsed).toBeLessThan(5_000);
  });

  test('should handle rapid scrolling without visual artifacts', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Rapidly scroll to different positions
    const positions = [2_000, 8_000, 1_000, 9_000, 0, 5_000, 3_000, 7_000];

    for (const position of positions) {
      await list.evaluate((el, pos) => {
        el.scrollTop = pos;
      }, position);
      // Locator-first assertion instead of waitForTimeout
      await expect(page.locator('[data-command-item]').first()).toBeVisible();
    }

    // After all scrolling, items should still be rendered
    const count = await page.locator('[data-command-item]').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(100);
  });

  test('should not leak DOM nodes during repeated scroll operations', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Perform many scroll cycles
    for (let cycle = 0; cycle < 5; cycle++) {
      await list.evaluate((el) => {
        el.scrollTop = Math.random() * el.scrollHeight;
      });
      // Locator-first assertion instead of waitForTimeout
      await expect(page.locator('[data-command-item]').first()).toBeVisible();
    }

    // DOM node count should remain bounded
    const finalCount = await page.locator('[data-command-item]').count();
    expect(finalCount).toBeLessThan(100);
  });

  // ---------- Combobox Integrity During Virtualization ----------

  test('should maintain combobox ARIA attributes during virtualized scroll', async ({ page }) => {
    const input = page.getByRole('combobox');
    const list = page.locator('[data-command-list]');

    // Scroll down
    await list.evaluate((el) => {
      el.scrollTop = 5_000;
    });
    // Locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // ARIA attributes should still be correct
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(input).toHaveAttribute('aria-controls', /.+/);

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
  });

  test('should update aria-activedescendant correctly in virtualized navigation', async ({
    page,
  }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Five ArrowDown presses move the active item from virt-item-0 to virt-item-5
    for (let i = 0; i < 5; i++) {
      await input.press('ArrowDown');
    }

    // Assert the settled end state: a count of 1 alone also holds mid-navigation
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveId('virt-item-5');
    await expect(activeItem).toHaveCount(1);

    // aria-activedescendant must name that same active item
    await expect(input).toHaveAttribute('aria-activedescendant', 'virt-item-5');
  });

  // ---------- Edge Cases ----------

  test('should handle scrolling with mouse wheel equivalent', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Simulate mouse wheel by scrolling the element
    await list.hover();
    await page.mouse.wheel(0, 500);
    // Locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    const items = page.locator('[data-command-item]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(100);
  });

  test('should render correctly when list container is resized', async ({ page }) => {
    // Resize the viewport
    await page.setViewportSize({ width: 600, height: 400 });
    // Locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    const items = page.locator('[data-command-item]');
    const narrowCount = await items.count();
    expect(narrowCount).toBeGreaterThan(0);
    expect(narrowCount).toBeLessThan(100);

    // Resize back to normal
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    const wideCount = await items.count();
    expect(wideCount).toBeGreaterThan(0);
    expect(wideCount).toBeLessThan(100);
  });
});

// The CE-119 hover case: scroll the list, then aim the pointer at every row with a visible pixel.
// Returns the number of rows hovered.
async function hoverEveryVisibleRow(page: Page): Promise<number> {
  const list = page.locator('[data-command-list]');
  await list.evaluate((el) => {
    el.scrollTop = 1_003;
  });
  await expect(page.locator('[data-command-item]').first()).toBeVisible();
  const scrollTop = await list.evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(900);

  // Rows with at least one visible pixel, as the viewport sees them: the first and last may be
  // partial. The list re-renders its rows after the scroll event, so wait until two reads agree.
  const read = (): Promise<
    { id: string; top: number; bottom: number; x: number; y: number; partial: boolean }[]
  > =>
    list.evaluate((el) => {
      const view = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLElement>('[data-command-item]')]
        .map((row) => {
          const box = row.getBoundingClientRect();
          return { id: row.id, top: box.top, bottom: box.bottom, x: box.left + box.width / 2 };
        })
        .filter((row) => row.bottom > view.top && row.top < view.bottom)
        .map((row) => ({
          ...row,
          // A point of the row that lies inside the viewport
          y: (Math.max(row.top, view.top) + Math.min(row.bottom, view.bottom)) / 2,
          partial: row.top < view.top || row.bottom > view.bottom,
        }));
    });

  let visible = await read();
  await expect
    .poll(async () => {
      const next = await read();
      const settled = JSON.stringify(next) === JSON.stringify(visible);
      visible = next;
      return settled && next.length > 3;
    })
    .toBe(true);
  // The viewport's offset into the rows is not a multiple of the row height: an edge row is partial
  expect(visible.some((row) => row.partial)).toBe(true);

  for (const { id } of visible) {
    // Read the row again: the page can still shift a few pixels after the first reads agree
    const row = (await read()).find((candidate) => candidate.id === id);
    if (!row) throw new Error(`row ${id} left the viewport`);
    await page.mouse.move(row.x, row.y);
    await expect(page.locator(`[data-command-item][data-active][id="${id}"]`)).toHaveCount(1);
    expect(await list.evaluate((el) => el.scrollTop)).toBe(scrollTop);
  }
  return visible.length;
}

// Navigates to the virtualized demo once the test has registered its routes, and waits for a row.
async function openVirtualizedDemo(page: Page): Promise<void> {
  await open(page, virtualizationUrl);
  await expect(page.locator('[data-command-item]').first()).toBeVisible();
}

test.describe('Virtualization — scroll to the active row (CE-119)', { tag: '@virtual' }, () => {
  // The whole list (its bottom edge sits near y = 1000 in the playground) fits the page viewport, so the mouse can reach every row
  test.use({ viewport: { width: 1280, height: 1100 } });

  test('CE-119: hovering a row already in view does not scroll the virtual list', async ({
    page,
  }) => {
    await openVirtualizedDemo(page);
    expect(await hoverEveryVisibleRow(page)).toBeGreaterThan(3);
  });

  // A late font swap moves the rows between the position read and the pointer move. The fonts load
  // before the first render, so holding every font response cannot move a row; the fonts.ready wait
  // of open() is a second guard.
  test('TEB-104: the CE-119 hover case passes without a per-describe fonts wait', async ({
    page,
  }) => {
    await page.route('**/*.woff2', async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });
    await openVirtualizedDemo(page);
    expect(await hoverEveryVisibleRow(page)).toBeGreaterThan(3);
  });

  test('CE-119: keyboard navigation to a row below the viewport scrolls it just into view', async ({
    page,
  }) => {
    await openVirtualizedDemo(page);
    const input = page.getByRole('combobox');
    await input.focus();
    const list = page.locator('[data-command-list]');

    // The list shows a few rows more than ten; ArrowDown walks past its bottom edge
    for (let i = 0; i < 30; i++) await input.press('ArrowDown');
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveId('virt-item-30');

    // The row's bottom edge meets the viewport's bottom edge (the scroll is no further than needed)
    await expect
      .poll(async () => {
        const [row, view] = await Promise.all([
          activeItem.evaluate((el) => el.getBoundingClientRect().bottom),
          list.evaluate((el) => el.getBoundingClientRect().bottom),
        ]);
        return Math.abs(view - row);
      })
      .toBeLessThanOrEqual(1);
  });
});
