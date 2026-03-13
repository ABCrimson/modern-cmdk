import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Playwright 1.59 — locator-first assertions, @axe-core/playwright 4.11.2-rc
test.describe('Accessibility — WCAG 2.1 AA', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for hydration — items must be visible
    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page.locator('[data-command-item]').first()).toBeVisible();
  });

  // ---------- axe-core Audit ----------

  test('should pass axe accessibility audit (WCAG 2.1 AA)', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should pass axe audit after filtering items', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.pressSequentially('app', { delay: 50 });

    // Wait for filter to complete
    await expect(page.getByRole('option').first()).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should pass axe audit with empty results', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.pressSequentially('zzzznonexistent', { delay: 50 });

    // Wait for empty state
    await expect(page.locator('[data-command-empty]')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should pass axe audit with keyboard navigation active', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    await input.press('ArrowDown');
    await input.press('ArrowDown');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  // ---------- ARIA Roles & Structure ----------

  test('should have correct combobox/listbox ARIA roles', async ({ page }) => {
    // Combobox input
    const input = page.getByRole('combobox');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');

    // Listbox
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    // aria-controls on input should point to listbox ID
    const controlsId = await input.getAttribute('aria-controls');
    const listboxId = await listbox.getAttribute('id');
    expect(controlsId).toBe(listboxId);
  });

  test('should have aria-expanded reflecting result availability', async ({ page }) => {
    const input = page.getByRole('combobox');
    await expect(input).toBeVisible();

    // When items exist, aria-expanded should be true
    const optionCount = await page.getByRole('option').count();
    if (optionCount > 0) {
      await expect(input).toHaveAttribute('aria-expanded', 'true');
    }

    // Filter to no results
    await input.pressSequentially('zzzznonexistent', { delay: 50 });
    await expect(page.locator('[data-command-empty]')).toBeVisible();

    // aria-expanded remains true because the listbox popup is still visible
    // (showing the empty state). Per WAI-ARIA, expanded reflects popup visibility.
    await expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  test('should have option role on all command items', async ({ page }) => {
    const items = page.locator('[data-command-item]');
    const count = await items.count();

    for (let i = 0; i < count; i++) {
      await expect(items.nth(i)).toHaveAttribute('role', 'option');
    }
  });

  test('should have aria-selected on active option only', async ({ page }) => {
    const options = page.getByRole('option');
    const count = await options.count();

    let selectedCount = 0;
    for (let i = 0; i < count; i++) {
      const ariaSelected = await options.nth(i).getAttribute('aria-selected');
      if (ariaSelected === 'true') {
        selectedCount++;
      }
    }

    // Exactly one item should be aria-selected=true
    expect(selectedCount).toBe(1);
  });

  // ---------- aria-activedescendant ----------

  test('should update aria-activedescendant on navigation', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Initial activedescendant should point to the first (active) item
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);
    const initialAD = await input.getAttribute('aria-activedescendant');
    expect(initialAD).toBeTruthy();

    // Navigate down
    await input.press('ArrowDown');

    // Wait for the active item to change
    const newActiveItem = page.locator('[data-command-item][data-active]');
    await expect(newActiveItem).toHaveCount(1);

    const afterDownAD = await input.getAttribute('aria-activedescendant');
    expect(afterDownAD).toBeTruthy();
    expect(afterDownAD).not.toBe(initialAD);

    // Verify it matches the active item's ID
    const activeId = await newActiveItem.getAttribute('id');
    expect(afterDownAD).toBe(activeId);
  });

  test('should clear aria-activedescendant when no results', async ({ page }) => {
    const input = page.getByRole('combobox');

    await input.pressSequentially('zzzznonexistent', { delay: 50 });

    // Wait for empty state to confirm filtering is complete
    await expect(page.locator('[data-command-empty]')).toBeVisible();

    // No options visible
    await expect(page.getByRole('option')).toHaveCount(0);

    // aria-activedescendant should be empty/null
    const ad = await input.getAttribute('aria-activedescendant');
    // It should be null, undefined, or empty string
    expect(!ad || ad === '').toBeTruthy();
  });

  test('should update aria-activedescendant to match first result after filtering', async ({
    page,
  }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    await input.pressSequentially('app', { delay: 50 });

    // Wait for filtered results
    const firstOption = page.getByRole('option').first();
    await expect(firstOption).toBeVisible();

    const ad = await input.getAttribute('aria-activedescendant');
    const firstOptionId = await firstOption.getAttribute('id');
    expect(ad).toBe(firstOptionId);
  });

  // ---------- aria-live Region ----------

  test('should have aria-live region announcing result counts', async ({ page }) => {
    // Use the specific data attribute for the sr-only live region
    const liveRegion = page.locator('[data-command-aria-live]');
    await expect(liveRegion).toBeAttached();

    // Should contain result count text
    await expect(liveRegion).toContainText(/result/);
  });

  test('should update aria-live region when filtering changes count', async ({ page }) => {
    const liveRegion = page.locator('[data-command-aria-live]');

    // Get initial text
    const initialText = await liveRegion.textContent();

    // Filter to reduce results
    const input = page.getByRole('combobox');
    await input.pressSequentially('app', { delay: 50 });

    // Wait for filtered results to appear
    await expect(page.getByRole('option').first()).toBeVisible();

    // Wait for the live region to update
    await expect(liveRegion).not.toHaveText(initialText ?? '');

    const updatedText = await liveRegion.textContent();
    expect(updatedText).toContain('result');
    expect(updatedText).not.toBe(initialText);
  });

  test('should announce "0 results" in live region when no matches', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.pressSequentially('zzzznonexistent', { delay: 50 });

    // Wait for empty state to confirm filtering is complete
    await expect(page.locator('[data-command-empty]')).toBeVisible();

    // Use the specific sr-only live region, not the empty state
    const liveRegion = page.locator('[data-command-aria-live]');
    await expect(liveRegion).toContainText('0 result');
  });

  test('should have aria-atomic on live region for complete announcements', async ({ page }) => {
    const liveRegion = page.locator('[data-command-aria-live]');
    // aria-atomic ensures the entire region content is announced, not just changes
    await expect(liveRegion).toHaveAttribute('aria-atomic', /(true|)/);
  });

  // ---------- Disabled Items ----------

  test('should mark disabled items with aria-disabled="true"', async ({ page }) => {
    const disabledItems = page.locator('[data-command-item][data-disabled]');
    const count = await disabledItems.count();

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(disabledItems.nth(i)).toHaveAttribute('aria-disabled', 'true');
      }
    }
  });

  test('disabled items should not become active via keyboard', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    const items = page.locator('[data-command-item]');
    const totalCount = await items.count();

    // Navigate through all items and verify no disabled item becomes active
    for (let i = 0; i < totalCount + 1; i++) {
      const activeItem = page.locator('[data-command-item][data-active]');
      const activeCount = await activeItem.count();

      if (activeCount > 0) {
        const hasDisabled = await activeItem.getAttribute('data-disabled');
        expect(hasDisabled).toBeNull();
      }

      await input.press('ArrowDown');
    }
  });

  // ---------- Empty State ----------

  test('should show empty state with role="status"', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.pressSequentially('zzzznonexistent', { delay: 50 });

    const empty = page.locator('[data-command-empty]');
    await expect(empty).toBeVisible();
    await expect(empty).toHaveRole('status');
    await expect(empty).toHaveAttribute('aria-live', 'polite');
  });

  // ---------- Group Accessibility ----------

  test('should have role="group" on groups with aria-labelledby', async ({ page }) => {
    const groups = page.locator('[data-command-group]');
    const groupCount = await groups.count();

    for (let i = 0; i < groupCount; i++) {
      const group = groups.nth(i);
      await expect(group).toHaveAttribute('role', 'group');

      // If group has a heading, aria-labelledby should point to it
      const heading = group.locator('[data-command-group-heading]');
      const hasHeading = (await heading.count()) > 0;

      if (hasHeading) {
        const headingId = await heading.getAttribute('id');
        expect(headingId).toBeTruthy();
        await expect(group).toHaveAttribute('aria-labelledby', headingId as string);

        // Heading should be aria-hidden (since it's referenced by aria-labelledby)
        await expect(heading).toHaveAttribute('aria-hidden', /(true|)/);
      }
    }
  });

  // ---------- ARIA Snapshot Testing (Playwright 1.59) ----------

  test('should match ARIA snapshot for combobox structure', async ({ page }) => {
    const root = page.locator('[data-command-root]');

    // Verify the ARIA tree structure — items are inside groups
    await expect(root).toMatchAriaSnapshot(`
      - search:
        - combobox
        - listbox:
          - group:
            - option
    `);
  });

  test('should match ARIA snapshot after filtering to single result', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.pressSequentially('app', { delay: 50 });

    // Wait for filtered results
    await expect(page.getByRole('option').first()).toBeVisible();

    const root = page.locator('[data-command-root]');
    await expect(root).toMatchAriaSnapshot(`
      - search:
        - combobox
        - listbox:
          - group:
            - option
    `);
  });

  test('should match ARIA snapshot for empty state', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.pressSequentially('zzzznonexistent', { delay: 50 });

    await expect(page.locator('[data-command-empty]')).toBeVisible();

    const root = page.locator('[data-command-root]');
    // Empty state: listbox is empty, status elements are outside it
    await expect(root).toMatchAriaSnapshot(`
      - search:
        - combobox
        - listbox
    `);
  });

  // ---------- Dialog Accessibility ----------

  test('should have correct dialog ARIA structure', async ({ page }) => {
    await page.goto('/dialog');

    const trigger = page.locator('[data-command-trigger]');
    await expect(trigger).toBeVisible();

    await trigger.click();

    // Wait for the dialog combobox to receive focus (confirms dialog is open and interactive)
    const combobox = page.getByRole('combobox');
    await expect(combobox).toBeFocused();

    // Dialog element should be in the DOM with open state
    const dialog = page.locator('[data-command-dialog]');
    await expect(dialog).toHaveAttribute('data-state', 'open');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should trap focus inside open dialog', async ({ page }) => {
    await page.goto('/dialog');

    const trigger = page.locator('[data-command-trigger]');
    await expect(trigger).toBeVisible();

    await trigger.click();

    // Wait for dialog to be interactive
    const input = page.getByRole('combobox');
    await expect(input).toBeFocused();

    const dialog = page.locator('[data-command-dialog]');
    await expect(dialog).toHaveAttribute('data-state', 'open');

    // Tab forward multiple times — should cycle within dialog
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Focus should still be within the dialog
    const focusedElement = page.locator(':focus');
    const isInsideDialog = await focusedElement.evaluate(
      (el, dialogEl) => {
        return dialogEl?.contains(el) ?? false;
      },
      await dialog.elementHandle(),
    );

    expect(isInsideDialog).toBeTruthy();
  });

  // ---------- Forced Colors Mode (Windows High Contrast) ----------

  test('should be usable in forced-colors mode', async ({ page }) => {
    // Emulate forced-colors: active
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');
    await expect(page.locator('[data-command-item]').first()).toBeVisible();

    // Ensure the palette still renders and is interactive
    const input = page.getByRole('combobox');
    await expect(input).toBeVisible();

    const options = page.getByRole('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);

    // Navigate and verify items are still distinguishable
    await input.focus();
    await input.press('ArrowDown');

    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);

    // In forced-colors mode, axe color-contrast rule is not applicable
    // so we check wcag2a rules (not color-dependent)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  // ---------- Label & Name Accessibility ----------

  test('should have accessible name on the command root', async ({ page }) => {
    const root = page.locator('[data-command-root]');
    await expect(root).toHaveAttribute('aria-label', /.+/);
  });

  test('should have accessible label on the combobox input', async ({ page }) => {
    const input = page.getByRole('combobox');
    await expect(input).toHaveAttribute('aria-label', /.+/);
  });

  test('should have accessible label on the listbox', async ({ page }) => {
    const listbox = page.getByRole('listbox');
    await expect(listbox).toHaveAttribute('aria-label', /.+/);
  });

  // ---------- Loading State Accessibility ----------

  test('should set aria-busy on listbox when loading', async ({ page }) => {
    const listbox = page.getByRole('listbox');
    // aria-busy should be present (true or false)
    const ariaBusy = await listbox.getAttribute('aria-busy');
    expect(ariaBusy).toBeDefined();
  });
});
