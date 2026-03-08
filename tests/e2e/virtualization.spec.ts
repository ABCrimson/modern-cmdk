import { expect, test } from '@playwright/test';

// Playwright 1.59 — locator-first assertions, toBeInViewport()
test.describe('Virtualization — 10K Items', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/virtualization');
    // Playwright 1.59 — wait for hydration using locator-first pattern
    await expect(page.locator('[data-command-root]')).toBeVisible();
    await expect(page.locator('[data-command-item]').first()).toBeVisible();
  });

  // ---------- DOM Node Count ----------

  test('should render 10K items with fewer than 100 DOM nodes', async ({ page }) => {
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    // With virtualization, only items in the viewport + overscan should be in the DOM
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(100);
  });

  test('should not render all 10K items in the DOM simultaneously', async ({ page }) => {
    // Verify the total rendered item count is dramatically less than 10K
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

    // Wait for virtualized content to update
    // Playwright 1.59 — use locator assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Get IDs of items after scroll
    const afterScrollItems = await page.locator('[data-command-item]').allTextContents();

    // The items should be different (we scrolled past the initial viewport)
    const initialSet = new Set(initialItems);
    const _afterSet = new Set(afterScrollItems);
    const overlap = afterScrollItems.filter((item) => initialSet.has(item));

    // Most items should be different after scrolling 5000px
    expect(overlap.length).toBeLessThan(initialItems.length);
  });

  test('should still limit DOM nodes after scrolling down', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Scroll to middle of list
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });

    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
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

    // Scroll down
    await list.evaluate((el) => {
      el.scrollTop = 5_000;
    });
    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Scroll back to top
    await list.evaluate((el) => {
      el.scrollTop = 0;
    });
    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Items should match the initial set
    const afterReturnItems = await page.locator('[data-command-item]').allTextContents();
    expect(afterReturnItems).toEqual(initialItems);
  });

  test('should maintain DOM node budget after scroll up/down cycle', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Scroll down
    await list.evaluate((el) => {
      el.scrollTop = 3_000;
    });
    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
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
    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
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

    // Press End — should go to item 10000
    await input.press('End');

    // An item should be active
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);

    // The DOM node count should still be bounded
    const totalDomItems = await page.locator('[data-command-item]').count();
    expect(totalDomItems).toBeLessThan(100);
  });

  // ---------- Scroll-to-Active on Keyboard Navigation ----------

  test('should scroll the active item into view during keyboard navigation', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const list = page.locator('[data-command-list]');

    // Get initial scroll position
    const initialScrollTop = await list.evaluate((el) => el.scrollTop);

    // Navigate down enough to require scrolling
    for (let i = 0; i < 30; i++) {
      await input.press('ArrowDown');
    }

    // Scroll position should have changed
    const afterScrollTop = await list.evaluate((el) => el.scrollTop);
    expect(afterScrollTop).toBeGreaterThan(initialScrollTop);

    // Active item should be visible in the viewport
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toBeVisible();
    await expect(activeItem).toBeInViewport();
  });

  test('should scroll active item into view when pressing End', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const list = page.locator('[data-command-list]');

    await input.press('End');

    // Active item should be visible
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);

    // List should have scrolled near the bottom
    const scrollTop = await list.evaluate((el) => el.scrollTop);
    const scrollHeight = await list.evaluate((el) => el.scrollHeight);
    const clientHeight = await list.evaluate((el) => el.clientHeight);

    // Should be near the bottom
    expect(scrollTop + clientHeight).toBeGreaterThan(scrollHeight - 100);
  });

  test('should scroll active item into view when pressing Home after End', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Go to the end
    await input.press('End');

    // Go back to the beginning
    await input.press('Home');

    const list = page.locator('[data-command-list]');
    const scrollTop = await list.evaluate((el) => el.scrollTop);

    // Should be back near the top
    expect(scrollTop).toBeLessThan(100);

    // Active item (first) should be visible
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toBeVisible();
  });

  // ---------- Filtering in Virtualized List ----------

  test('should filter 10K items and maintain virtualization', async ({ page }) => {
    const input = page.getByRole('combobox');

    // Type a search query
    await input.pressSequentially('item 5', { delay: 30 });

    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
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
    await input.pressSequentially('item 5', { delay: 30 });
    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Clear
    await input.press('Control+a');
    await input.press('Backspace');
    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Should return to approximately the same DOM count
    const afterClearCount = await page.locator('[data-command-item]').count();
    expect(afterClearCount).toBe(initialCount);
  });

  // ---------- Performance ----------

  test('should render initial 10K list within acceptable time', async ({ page }) => {
    // Navigate to the virtualization page and measure performance
    const startTime = Date.now();

    await page.goto('/virtualization');
    await expect(page.locator('[data-command-root]')).toBeVisible();
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    const elapsed = Date.now() - startTime;

    // The initial render should complete within 5 seconds (generous for CI)
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
      // Playwright 1.59 — locator-first assertion instead of waitForTimeout
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
      // Playwright 1.59 — locator-first assertion instead of waitForTimeout
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
    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
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

    // Navigate down multiple times
    for (let i = 0; i < 15; i++) {
      await input.press('ArrowDown');
    }

    // aria-activedescendant should point to the active item
    const ad = await input.getAttribute('aria-activedescendant');
    expect(ad).toBeTruthy();

    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);
    const activeId = await activeItem.getAttribute('id');
    expect(ad).toBe(activeId);
  });

  // ---------- Edge Cases ----------

  test('should handle scrolling with mouse wheel equivalent', async ({ page }) => {
    const list = page.locator('[data-command-list]');

    // Simulate mouse wheel by scrolling the element
    await list.hover();
    await page.mouse.wheel(0, 500);
    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    const items = page.locator('[data-command-item]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(100);
  });

  test('should render correctly when list container is resized', async ({ page }) => {
    // Resize the viewport
    await page.setViewportSize({ width: 600, height: 400 });
    // Playwright 1.59 — locator-first assertion instead of waitForTimeout
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
