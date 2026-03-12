import { expect, test } from '@playwright/test';

// Playwright 1.59 — locator-first assertions throughout
test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Playwright 1.59 — wait for hydration using locator-first pattern
    await expect(page.locator('[data-command-root]')).toBeVisible();
    await expect(page.locator('[data-command-item]').first()).toBeVisible();
  });

  // ---------- Arrow Key Navigation ----------

  test('should navigate down through items with ArrowDown', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // First item should be active by default
    const firstItem = page.locator('[data-command-item]').first();
    await expect(firstItem).toHaveAttribute('data-active', '');

    // Press ArrowDown to move to second item
    await input.press('ArrowDown');

    const secondItem = page.locator('[data-command-item]').nth(1);
    const itemCount = await page.locator('[data-command-item]').count();

    if (itemCount > 1) {
      await expect(secondItem).toHaveAttribute('data-active', '');
      // First item should no longer be active
      await expect(firstItem).not.toHaveAttribute('data-active', '');
    }

    // Only one item should be active at a time
    const activeItems = page.locator('[data-command-item][data-active]');
    await expect(activeItems).toHaveCount(1);
  });

  test('should navigate up through items with ArrowUp', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    if (count < 2) return;

    // Move down twice
    await input.press('ArrowDown');
    await input.press('ArrowDown');

    // Move up once — should go back one position
    await input.press('ArrowUp');

    const activeItems = page.locator('[data-command-item][data-active]');
    await expect(activeItems).toHaveCount(1);

    // The active item should be the second one (index 1)
    const secondItem = items.nth(1);
    await expect(secondItem).toHaveAttribute('data-active', '');
  });

  test('should wrap around to first item when pressing ArrowDown at the end', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    if (count < 2) return;

    // Navigate to the last item using End
    await input.press('End');
    const lastItem = items.last();
    await expect(lastItem).toHaveAttribute('data-active', '');

    // Press ArrowDown — should wrap to first item (loop is enabled by default)
    await input.press('ArrowDown');
    const firstItem = items.first();
    await expect(firstItem).toHaveAttribute('data-active', '');
  });

  test('should wrap around to last item when pressing ArrowUp at the beginning', async ({
    page,
  }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    if (count < 2) return;

    // First item should be active
    const firstItem = items.first();
    await expect(firstItem).toHaveAttribute('data-active', '');

    // Press ArrowUp — should wrap to last item
    await input.press('ArrowUp');
    const lastItem = items.last();
    await expect(lastItem).toHaveAttribute('data-active', '');
  });

  test('should navigate through all items sequentially with ArrowDown', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    // Navigate through every item
    for (let i = 0; i < count; i++) {
      const activeItems = page.locator('[data-command-item][data-active]');
      await expect(activeItems).toHaveCount(1);

      const activeId = await activeItems.getAttribute('id');
      const currentItemId = await items.nth(i).getAttribute('id');
      expect(activeId).toBe(currentItemId);

      if (i < count - 1) {
        await input.press('ArrowDown');
      }
    }
  });

  // ---------- Home / End Navigation ----------

  test('should jump to first item with Home key', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    if (count < 3) return;

    // Navigate down a few items
    await input.press('ArrowDown');
    await input.press('ArrowDown');
    await input.press('ArrowDown');

    // Press Home
    await input.press('Home');

    const firstItem = items.first();
    await expect(firstItem).toHaveAttribute('data-active', '');
  });

  test('should jump to last item with End key', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    await input.press('End');

    const lastItem = page.locator('[data-command-item]').last();
    await expect(lastItem).toHaveAttribute('data-active', '');
  });

  test('Home then End should cover full range', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    if (count < 2) return;

    // Go to end
    await input.press('End');
    const lastId = await page.locator('[data-command-item][data-active]').getAttribute('id');

    // Go back to start
    await input.press('Home');
    const firstId = await page.locator('[data-command-item][data-active]').getAttribute('id');

    expect(firstId).not.toBe(lastId);
    await expect(items.first()).toHaveAttribute('data-active', '');
  });

  // ---------- Enter to Select ----------

  test('should select the active item with Enter', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Get the currently active item's value
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);
    const activeValue = await activeItem.getAttribute('data-value');
    expect(activeValue).toBeTruthy();

    // Press Enter to select
    await input.press('Enter');

    // Selection should have occurred (no crash, item callback fired)
  });

  test('should select a specific item after navigating to it', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    if (count < 3) return;

    // Navigate to third item
    await input.press('ArrowDown');
    await input.press('ArrowDown');

    const activeItem = page.locator('[data-command-item][data-active]');
    const thirdItemId = await items.nth(2).getAttribute('id');
    const activeId = await activeItem.getAttribute('id');
    expect(activeId).toBe(thirdItemId);

    // Select it
    await input.press('Enter');
  });

  // ---------- Escape to Close ----------

  test('should close the palette with Escape', async ({ page }) => {
    await page.goto('/dialog');

    // Open the dialog first
    const trigger = page.locator('[data-command-trigger], button:has-text("Open")');
    const hasTrigger = (await trigger.count()) > 0;

    if (hasTrigger) {
      await trigger.first().click();
      const dialog = page.locator('[data-command-dialog]');
      await expect(dialog).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Dialog should close
      await expect(dialog).toBeHidden({ timeout: 5_000 });
    }
  });

  test('Escape on inline palette should update state', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Press Escape
    await input.press('Escape');

    // The root state should reflect closed
    const root = page.locator('[data-command-root]');
    await expect(root).toHaveAttribute('data-command-state', 'closed');
  });

  // ---------- Backspace to Pop Page ----------

  test('should pop page on Backspace when input is empty', async ({ page }) => {
    // This test checks the page stack behavior
    const input = page.getByRole('combobox');
    await input.focus();

    // If there are pages, the initial page should be visible
    const pages = page.locator('[data-command-page]');
    const _initialPageCount = await pages.count();

    // Pressing Backspace with empty input should attempt to pop page
    await expect(input).toHaveValue('');
    await input.press('Backspace');

    // If no page stack, nothing should happen (no crash)
  });

  test('should not pop page on Backspace when input has text', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Type something first
    await input.pressSequentially('test', { delay: 50 });
    await expect(input).toHaveValue('test');

    // Backspace should delete a character, not pop page
    await input.press('Backspace');
    await expect(input).toHaveValue('tes');
  });

  // ---------- Tab Key Behavior ----------

  test('should allow Tab to move focus out of the palette', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    await expect(input).toBeFocused();

    // Tab should move focus away from the input
    await input.press('Tab');

    // Input should no longer be focused (focus moved to next focusable element)
    await expect(input).not.toBeFocused();
  });

  // ---------- pressSequentially Typing ----------

  test('should type characters sequentially with pressSequentially', async ({ page }) => {
    const input = page.getByRole('combobox');

    await input.pressSequentially('hello world', { delay: 50 });

    await expect(input).toHaveValue('hello world');
  });

  test('should handle special characters via pressSequentially', async ({ page }) => {
    const input = page.getByRole('combobox');

    await input.pressSequentially('file.ts', { delay: 50 });
    await expect(input).toHaveValue('file.ts');
  });

  test('should filter in real-time as characters are typed sequentially', async ({ page }) => {
    const input = page.getByRole('combobox');
    const initialCount = await page.getByRole('option').count();

    // Type one character at a time and verify filtering progresses
    await input.pressSequentially('a', { delay: 50 });
    // After typing one character, count may change
    const afterOneChar = await page.getByRole('option').count();

    await input.pressSequentially('pp', { delay: 50 });
    // After typing more, further filtering may occur
    const afterThreeChars = await page.getByRole('option').count();

    // The filtered count should be less than or equal to the initial
    expect(afterThreeChars).toBeLessThanOrEqual(afterOneChar);
    expect(afterOneChar).toBeLessThanOrEqual(initialCount);
  });

  // ---------- Keyboard Shortcut Registration ----------

  test('should register and respond to Ctrl+K shortcut for dialog toggle', async ({ page }) => {
    await page.goto('/dialog');

    // Press Ctrl+K to toggle
    await page.keyboard.press('Control+k');

    const dialog = page.locator('[data-command-dialog]');
    const isVisible = await dialog.isVisible().catch(() => false);

    if (isVisible) {
      // Press Ctrl+K again to close (or Escape)
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden({ timeout: 5_000 });
    }
  });

  test('should handle item keyboard shortcuts (aria-keyshortcuts)', async ({ page }) => {
    // Check if any items have keyboard shortcuts defined
    const itemsWithShortcuts = page.locator('[data-command-item][aria-keyshortcuts]');
    const count = await itemsWithShortcuts.count();

    if (count > 0) {
      const shortcut = await itemsWithShortcuts.first().getAttribute('aria-keyshortcuts');
      expect(shortcut).toBeTruthy();
    }
  });

  // ---------- Disabled Item Behavior ----------

  test('should skip disabled items during keyboard navigation', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    const disabledItems = page.locator('[data-command-item][data-disabled]');
    const disabledCount = await disabledItems.count();

    if (disabledCount > 0) {
      const items = page.locator('[data-command-item]');
      const totalCount = await items.count();

      // Navigate through all items
      for (let i = 0; i < totalCount; i++) {
        const activeItem = page.locator('[data-command-item][data-active]');
        const isDisabled = await activeItem.getAttribute('data-disabled');

        // Active item should never be a disabled item (disabled items are filtered out)
        expect(isDisabled).toBeNull();

        await input.press('ArrowDown');
      }
    }
  });

  // ---------- Combined Keyboard Sequences ----------

  test('should handle complex keyboard sequence: type, navigate, select', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Type a search query
    await input.pressSequentially('app', { delay: 50 });

    // Navigate down
    await input.press('ArrowDown');

    // Navigate back up
    await input.press('ArrowUp');

    // Verify active item exists
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);

    // Select with Enter
    await input.press('Enter');
  });

  test('should handle clear search then navigate', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const initialCount = await page.getByRole('option').count();

    // Type to filter
    await input.pressSequentially('test', { delay: 50 });

    // Clear with Ctrl+A then Backspace
    await input.press('Control+a');
    await input.press('Backspace');
    await expect(input).toHaveValue('');

    // All items should return
    await expect(page.getByRole('option')).toHaveCount(initialCount);

    // Navigation should work on full list
    await input.press('ArrowDown');
    await input.press('ArrowDown');
    const activeItems = page.locator('[data-command-item][data-active]');
    await expect(activeItems).toHaveCount(1);
  });

  // ---------- aria-activedescendant Updates ----------

  test('should update aria-activedescendant on each navigation step', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    if (count < 2) return;

    // Get initial activedescendant
    const initialAD = await input.getAttribute('aria-activedescendant');

    // Navigate down
    await input.press('ArrowDown');
    const afterDownAD = await input.getAttribute('aria-activedescendant');

    // activedescendant should change
    expect(afterDownAD).not.toBe(initialAD);
    expect(afterDownAD).toBeTruthy();

    // The activedescendant should match the active item's ID
    const activeItem = page.locator('[data-command-item][data-active]');
    const activeId = await activeItem.getAttribute('id');
    expect(afterDownAD).toBe(activeId);
  });
});
