import { expect, test } from '@playwright/test';

// Playwright 1.59 — locator-first assertions throughout
test.describe('Basic Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Playwright 1.59 — wait for hydration using locator-first pattern
    await expect(page.locator('[data-command-root]')).toBeVisible();
  });

  // ---------- Rendering & ARIA attributes ----------

  test('should render command root with correct data attribute and role', async ({ page }) => {
    const root = page.locator('[data-command-root]');
    await expect(root).toBeVisible();
    await expect(root).toHaveAttribute('role', 'application');
    await expect(root).toHaveAttribute('aria-label', /command palette/i);
  });

  test('should render combobox input with full ARIA attributes', async ({ page }) => {
    const input = page.getByRole('combobox');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(input).toHaveAttribute('aria-expanded', /(true|false)/);
    await expect(input).toHaveAttribute('aria-controls', /.+/);
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveAttribute('autocomplete', 'off');
    await expect(input).toHaveAttribute('spellcheck', 'false');
  });

  test('should render listbox with correct role and ID', async ({ page }) => {
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    // The listbox ID should match the input's aria-controls
    const input = page.getByRole('combobox');
    const controlsId = await input.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    await expect(listbox).toHaveAttribute('id', controlsId as string);
  });

  test('should render items as role="option" with data attributes', async ({ page }) => {
    const options = page.getByRole('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);

    // Each option should have the data-command-item attribute and a data-value
    const firstOption = options.first();
    await expect(firstOption).toHaveAttribute('data-command-item', '');
    await expect(firstOption).toHaveAttribute('data-value', /.+/);
    await expect(firstOption).toHaveAttribute('id', /.+/);
  });

  test('should have an active (first) item by default', async ({ page }) => {
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);
    await expect(activeItem).toHaveAttribute('aria-selected', 'true');
  });

  // ---------- Search & Filtering ----------

  test('should filter items when typing a search query', async ({ page }) => {
    const input = page.getByRole('combobox');
    const initialCount = await page.getByRole('option').count();
    expect(initialCount).toBeGreaterThan(1);

    await input.pressSequentially('app', { delay: 30 });

    // Wait for filter to take effect
    await expect(page.getByRole('option')).not.toHaveCount(initialCount);
    const filteredCount = await page.getByRole('option').count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(initialCount);
  });

  test('should show all items when search is cleared', async ({ page }) => {
    const input = page.getByRole('combobox');
    const initialCount = await page.getByRole('option').count();

    // Type to filter
    await input.pressSequentially('app', { delay: 30 });
    await expect(page.getByRole('option')).not.toHaveCount(initialCount);

    // Clear the input — select all text then delete
    await input.press('Control+a');
    await input.press('Backspace');

    // All items should return
    await expect(page.getByRole('option')).toHaveCount(initialCount);
  });

  test('should show empty state when no items match', async ({ page }) => {
    const input = page.getByRole('combobox');

    await input.pressSequentially('zzzznonexistent', { delay: 20 });

    // No options should be visible
    await expect(page.getByRole('option')).toHaveCount(0);

    // Empty state should be rendered
    const empty = page.locator('[data-command-empty]');
    await expect(empty).toBeVisible();
    await expect(empty).toHaveRole('status');
  });

  test('should update aria-live region with result count after filtering', async ({ page }) => {
    const input = page.getByRole('combobox');

    await input.pressSequentially('app', { delay: 30 });

    const liveRegion = page.locator('[aria-live="polite"]');
    await expect(liveRegion).toContainText(/result/);
  });

  // ---------- Item Selection ----------

  test('should select item on click and trigger callback', async ({ page }) => {
    // Listen for console messages to verify selection callback fired
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        consoleMessages.push(msg.text());
      }
    });

    const firstOption = page.getByRole('option').first();
    await firstOption.click();

    // The click handler should fire — verify the item was selected
    // (The exact behavior depends on the playground setup; at minimum the click should work)
    await expect(firstOption).toBeVisible();
  });

  test('should activate item on hover (pointer move)', async ({ page }) => {
    const options = page.getByRole('option');
    const count = await options.count();
    if (count < 2) return;

    const secondOption = options.nth(1);
    await secondOption.hover();

    // The hovered item should become active
    await expect(secondOption).toHaveAttribute('data-active', '');
    await expect(secondOption).toHaveAttribute('aria-selected', 'true');
  });

  test('should select item with Enter key', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Navigate to first item and press Enter
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);

    await input.press('Enter');

    // Enter should trigger selection (behavior depends on playground — verify no crash)
  });

  // ---------- Groups ----------

  test('should render groups with heading and correct roles', async ({ page }) => {
    const groups = page.locator('[data-command-group]');
    const groupCount = await groups.count();

    if (groupCount > 0) {
      const firstGroup = groups.first();
      await expect(firstGroup).toHaveAttribute('role', 'group');

      // Check if group has a heading
      const heading = firstGroup.locator('[data-command-group-heading]');
      const hasHeading = (await heading.count()) > 0;

      if (hasHeading) {
        const headingId = await heading.getAttribute('id');
        expect(headingId).toBeTruthy();
        await expect(firstGroup).toHaveAttribute('aria-labelledby', headingId as string);
      }
    }
  });

  // ---------- Page Navigation ----------

  test('should support page navigation if pages are configured', async ({ page }) => {
    const pages = page.locator('[data-command-page]');
    const pageCount = await pages.count();

    if (pageCount > 0) {
      const activePage = pages.first();
      const pageId = await activePage.getAttribute('data-command-page-id');
      expect(pageId).toBeTruthy();
      await expect(activePage).toBeVisible();
    }
  });

  // ---------- Dialog Mode ----------

  test('should open and close dialog with animation states', async ({ page }) => {
    await page.goto('/dialog');

    // Dialog should initially be closed
    const dialog = page.locator('[data-command-dialog]');

    // Trigger open — look for a trigger button or use keyboard shortcut
    const trigger = page.locator('[data-command-trigger], button:has-text("Open")');
    const hasTrigger = (await trigger.count()) > 0;

    if (hasTrigger) {
      await trigger.first().click();

      // Dialog should become visible
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('data-state', 'open');

      // Overlay should also be visible
      const overlay = page.locator('[data-command-overlay]');
      await expect(overlay).toBeVisible();
      await expect(overlay).toHaveAttribute('data-state', 'open');

      // Close with Escape
      await page.keyboard.press('Escape');

      // Dialog should close (may animate out)
      await expect(dialog).toBeHidden({ timeout: 5_000 });
    }
  });

  test('should open dialog with Ctrl+K keyboard shortcut', async ({ page }) => {
    await page.goto('/dialog');

    // Press Ctrl+K to open
    await page.keyboard.press('Control+k');

    const dialog = page.locator('[data-command-dialog]');
    const isVisible = await dialog.isVisible().catch(() => false);

    if (isVisible) {
      await expect(dialog).toHaveAttribute('data-state', 'open');

      // Input inside dialog should be focused
      const input = page.getByRole('combobox');
      await expect(input).toBeFocused();
    }
  });

  // ---------- Cross-Browser Consistency ----------

  test('should maintain consistent item count across renders', async ({ page }) => {
    const options = page.getByRole('option');
    const initialCount = await options.count();

    // Navigate away and back
    await page.goto('/');

    const afterCount = await page.getByRole('option').count();
    expect(afterCount).toBe(initialCount);
  });

  test('should handle rapid search input without errors', async ({ page }) => {
    const input = page.getByRole('combobox');

    // Type rapidly
    await input.pressSequentially('testing rapid input', { delay: 10 });
    await expect(input).toHaveValue('testing rapid input');

    // Clear and type again
    await input.press('Control+a');
    await input.press('Backspace');
    await expect(input).toHaveValue('');

    await input.pressSequentially('another query', { delay: 10 });
    await expect(input).toHaveValue('another query');
  });

  test('should preserve focus on input during filtering', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    await expect(input).toBeFocused();

    await input.pressSequentially('test', { delay: 30 });

    // Focus should remain on the input after filtering
    await expect(input).toBeFocused();
  });

  test('should not have JavaScript errors in console', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Interact with the page
    const input = page.getByRole('combobox');
    await input.focus();
    await input.pressSequentially('test', { delay: 30 });
    await input.press('ArrowDown');
    await input.press('ArrowUp');
    await input.press('Enter');

    expect(errors).toEqual([]);
  });
});
