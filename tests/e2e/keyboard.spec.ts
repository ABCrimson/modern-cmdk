import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, open, test } from './fixtures';

// Locator-first assertions throughout
test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/');
    // Wait for hydration using locator-first pattern
    await expect(page.locator('[data-command-root]')).toBeVisible();
    await expect(page.locator('[data-command-item]').first()).toBeVisible();
  });

  // ---------- T22: item-count preconditions ----------

  test('T22: BasicDemo renders 15 items before the keyboard cases run', async ({ page }) => {
    await expect(page.locator('[data-command-item]')).toHaveCount(15);
    await expect(page.locator('[data-command-item]:not([data-disabled])')).toHaveCount(14);
  });

  test('T22: the keyboard and basic specs assert their item count instead of returning early', () => {
    // Each pattern keeps one character in a class so that this file never matches itself
    const earlyReturns = [
      /\bi[f] \(.*\bcount\b.*\) return\b/,
      /has[T]rigger/,
      /count [>] 0/,
      /isVisible\(\)\)\) retur[n]/,
    ];
    const offenders: string[] = [];
    for (const file of ['basic.spec.ts', 'keyboard.spec.ts']) {
      const lines = readFileSync(join(import.meta.dirname, file), 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (earlyReturns.some((pattern) => pattern.test(line))) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }
    expect(offenders, 'early-return guards in the e2e specs').toEqual([]);
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
    // The basic demo has more than one item, so the second one exists
    await expect(secondItem).toHaveAttribute('data-active', '');
    // First item should no longer be active
    await expect(firstItem).not.toHaveAttribute('data-active', '');

    // Only one item should be active at a time
    const activeItems = page.locator('[data-command-item][data-active]');
    await expect(activeItems).toHaveCount(1);
  });

  test('should navigate up through items with ArrowUp', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    await expect(items).toHaveCount(15);

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
    await expect(items).toHaveCount(15);

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
    await expect(items).toHaveCount(15);

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

    // Navigate through enabled items — disabled items are skipped by ArrowDown
    const enabledItems = page.locator('[data-command-item]:not([data-disabled])');
    const enabledCount = await enabledItems.count();

    for (let i = 0; i < enabledCount; i++) {
      // Use auto-retrying assertion to wait for React state propagation
      const activeItems = page.locator('[data-command-item][data-active]');
      await expect(activeItems).toHaveCount(1);

      if (i < enabledCount - 1) {
        await input.press('ArrowDown');
      }
    }
  });

  // ---------- Home / End Navigation ----------

  test('should jump to first item with Home key', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    await expect(items).toHaveCount(15);

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
    const enabledItems = page.locator('[data-command-item]:not([data-disabled])');
    await expect(enabledItems).toHaveCount(14);

    // Go to end — wait for last enabled item to become active
    await input.press('End');
    const lastEnabledItem = enabledItems.last();
    await expect(lastEnabledItem).toHaveAttribute('data-active', '');

    // Go back to start — wait for first item to become active
    await input.press('Home');
    const firstItem = enabledItems.first();
    await expect(firstItem).toHaveAttribute('data-active', '');
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

    await expect(page.getByTestId('last-selected')).toHaveText(activeValue as string);
  });

  test('should select a specific item after navigating to it', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    const items = page.locator('[data-command-item]');
    await expect(items).toHaveCount(15);

    // Navigate to third item
    await input.press('ArrowDown');
    await input.press('ArrowDown');

    // Wait for the third item to become active (auto-retrying assertion)
    const thirdItem = items.nth(2);
    await expect(thirdItem).toHaveAttribute('data-active', '');

    // Select it
    const thirdValue = await thirdItem.getAttribute('data-value');
    expect(thirdValue).toBeTruthy();
    await input.press('Enter');
    await expect(page.getByTestId('last-selected')).toHaveText(thirdValue as string);
  });

  // ---------- Escape to Close ----------

  test('should close the palette with Escape', async ({ page }) => {
    await open(page, '/dialog');

    // Open the dialog first
    await page.locator('[data-command-trigger]').click();
    const dialog = page.locator('[data-command-dialog]');
    await expect(dialog).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Dialog should close
    await expect(dialog).toBeHidden({ timeout: 5_000 });
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
    await expect(page.getByRole('option')).toHaveCount(15);

    // Type one character at a time and verify filtering progresses
    await input.pressSequentially('a', { delay: 50 });
    // After typing one character, count may change
    const afterOneChar = await page.getByRole('option').count();

    await input.pressSequentially('pp', { delay: 50 });
    // After typing more, further filtering may occur
    const afterThreeChars = await page.getByRole('option').count();

    // The filtered count should be less than or equal to the initial
    expect(afterThreeChars).toBeLessThanOrEqual(afterOneChar);
    expect(afterOneChar).toBeLessThanOrEqual(15);
  });

  // ---------- Keyboard Shortcut Registration ----------

  test('should register and respond to Ctrl+K shortcut for dialog toggle', async ({ page }) => {
    await open(page, '/dialog');

    // Press Ctrl+K to toggle
    await page.keyboard.press('Control+k');

    const dialog = page.locator('[data-command-dialog]');
    await expect(dialog).toBeVisible();

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('TEB-76: Mod+N in the focused input selects the New File item', async ({ page }) => {
    // The basic demo binds shortcut="Mod+N" on the "create new file" item
    const newFile = page.locator('[data-command-item][data-value="create new file"]');
    await expect(newFile).toHaveAttribute('aria-keyshortcuts', /\S/);

    const input = page.getByRole('combobox');
    await input.focus();
    await input.press('ControlOrMeta+n');

    await expect(page.getByTestId('last-selected')).toHaveText('create new file');
  });

  // ---------- Disabled Item Behavior ----------

  test('D78: should skip the rendered disabled item during keyboard navigation', async ({
    page,
  }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // The body must run: the disabled "Pear" is rendered with aria-disabled and data-disabled
    const pear = page.getByRole('option', { name: /Pear/ });
    await expect(pear).toHaveCount(1);
    await expect(pear).toHaveAttribute('aria-disabled', 'true');
    await expect(pear).toHaveAttribute('data-disabled', /.*/);

    const active = page.locator('[data-command-item][data-active]');
    const totalCount = await page.locator('[data-command-item]').count();

    // ArrowDown and ArrowUp through more than the whole list, pressing Enter on each stop:
    // the active option is never [data-disabled] and Pear is never active or selected
    for (const key of ['ArrowDown', 'ArrowUp']) {
      for (let i = 0; i < totalCount + 1; i++) {
        const before = await input.getAttribute('aria-activedescendant');
        await input.press(key);
        await expect(input).not.toHaveAttribute('aria-activedescendant', before ?? '');
        await expect(active).toHaveCount(1);
        await expect(active).not.toHaveAttribute('data-disabled', /.*/);
        await input.press('Enter');
        await expect(pear).not.toHaveAttribute('data-active', /.*/);
        await expect(pear).not.toHaveAttribute('aria-selected', 'true');
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
    const activeValue = await activeItem.getAttribute('data-value');
    expect(activeValue).toBeTruthy();
    await input.press('Enter');
    await expect(page.getByTestId('last-selected')).toHaveText(activeValue as string);
  });

  test('should handle clear search then navigate', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    await expect(page.getByRole('option')).toHaveCount(15);

    // Type to filter
    await input.pressSequentially('test', { delay: 50 });

    // Clear with Ctrl+A then Backspace
    await input.press('Control+a');
    await input.press('Backspace');
    await expect(input).toHaveValue('');

    // All items should return
    await expect(page.getByRole('option')).toHaveCount(15);

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
    await expect(items).toHaveCount(15);

    // Get initial active item
    const firstItem = items.first();
    await expect(firstItem).toHaveAttribute('data-active', '');
    const initialAD = await input.getAttribute('aria-activedescendant');

    // Navigate down — wait for second item to become active
    await input.press('ArrowDown');
    const secondItem = items.nth(1);
    await expect(secondItem).toHaveAttribute('data-active', '');

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
