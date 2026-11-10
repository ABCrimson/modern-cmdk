import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, open, test } from './fixtures';

// Locator-first assertions throughout
test.describe('Keyboard Navigation', { tag: '@keyboard' }, () => {
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
      /\bi[f] \(.*[cC]ount\b.*\) return\b/,
      /has[T]rigger/,
      /count [>] 0/,
      /isVisible\(\)\)+ retur[n]/,
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
    await expect(enabledItems).toHaveCount(14);
    const enabledCount = 14;

    for (let i = 0; i < enabledCount; i++) {
      // Use auto-retrying assertions to wait for React state propagation
      const activeItems = page.locator('[data-command-item][data-active]');
      await expect(activeItems).toHaveCount(1);
      await expect(enabledItems.nth(i)).toHaveAttribute('data-active', '');

      if (i < enabledCount - 1) {
        await input.press('ArrowDown');
      }
    }
  });

  // ---------- Home / End Navigation ----------

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

  test('RA-38: in the browser, Escape on a closed inline palette is left to the page', async ({
    page,
  }) => {
    const root = page.locator('[data-command-root]');
    // An inline palette starts closed (`open` defaults to false)
    await expect(root).toHaveAttribute('data-command-state', 'closed');
    const input = page.getByRole('combobox');
    await input.focus();

    // A bubbling listener on window runs after the palette's React handler, so it reads the flag
    // the handler leaves behind
    await page.evaluate(() => {
      const seen: boolean[] = [];
      Object.assign(window, { escapeSeen: seen });
      window.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Escape') seen.push(event.defaultPrevented);
        },
        { once: true },
      );
    });
    await input.press('Escape');

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { escapeSeen: boolean[] }).escapeSeen))
      .toEqual([false]);
    await expect(root).toHaveAttribute('data-command-state', 'closed');
  });

  // ---------- Backspace to Pop Page ----------

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

  // ---------- Keyboard Shortcut Registration ----------

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
    await expect(page.locator('[data-command-item]').first()).toHaveAttribute(
      'data-value',
      'apple',
    );

    // Navigate down
    await input.press('ArrowDown');

    // Navigate back up
    await input.press('ArrowUp');

    // The first result is the active item again
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveAttribute('data-value', 'apple');

    // Select with Enter
    await input.press('Enter');
    await expect(page.getByTestId('last-selected')).toHaveText('apple');
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
});
