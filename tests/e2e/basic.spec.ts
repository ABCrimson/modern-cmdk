import { expect, open, test } from './fixtures';

// Locator-first assertions throughout
test.describe('Basic Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/');
    // Wait for hydration using locator-first pattern
    await expect(page.locator('[data-command-root]')).toBeVisible();
  });

  // ---------- Rendering & ARIA attributes ----------

  test('should render command root with correct data attribute and role', async ({ page }) => {
    const root = page.locator('[data-command-root]');
    await expect(root).toBeVisible();
    await expect(root).toHaveAttribute('role', 'search');
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

    await input.pressSequentially('app', { delay: 50 });

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
    await input.pressSequentially('app', { delay: 50 });
    await expect(page.getByRole('option')).not.toHaveCount(initialCount);

    // Clear the input — select all text then delete
    await input.press('Control+a');
    await input.press('Backspace');

    // All items should return
    await expect(page.getByRole('option')).toHaveCount(initialCount);
  });

  test('should show empty state when no items match', async ({ page }) => {
    const input = page.getByRole('combobox');

    await input.pressSequentially('zzzznonexistent', { delay: 50 });

    // No options should be visible
    await expect(page.getByRole('option')).toHaveCount(0);

    // Empty state should be rendered
    const empty = page.locator('[data-command-empty]');
    await expect(empty).toBeVisible();
    await expect(empty).toHaveRole('status');
  });

  test('should update aria-live region with result count after filtering', async ({ page }) => {
    const input = page.getByRole('combobox');

    await input.pressSequentially('app', { delay: 50 });

    // Wait for filter to complete
    await expect(page.getByRole('option').first()).toBeVisible();

    const liveRegion = page.locator('[aria-live="polite"]');
    await expect(liveRegion).toContainText(/result/);
  });

  // ---------- Item Selection ----------

  test('TEB-28: click and Enter write the selected value into the last-selected output', async ({
    page,
  }) => {
    const output = page.getByTestId('last-selected');

    await page.getByRole('option').first().click();
    await expect(output).toHaveText('apple');

    // Move the active item away from "apple", then select it with Enter
    const input = page.getByRole('combobox');
    await input.focus();
    const activeItem = page.locator('[data-command-item][data-active]');
    await input.press('ArrowDown');
    await expect(activeItem).not.toHaveAttribute('data-value', 'apple');
    const activeValue = await activeItem.getAttribute('data-value');
    expect(activeValue).toBeTruthy();
    await input.press('Enter');
    await expect(output).toHaveText(activeValue as string);
  });

  test('should activate item on hover (pointer move)', async ({ page }) => {
    const options = page.getByRole('option');
    await expect(options).toHaveCount(15);

    const secondOption = options.nth(1);
    await secondOption.hover();

    // The hovered item should become active
    await expect(secondOption).toHaveAttribute('data-active', '');
    await expect(secondOption).toHaveAttribute('aria-selected', 'true');
  });

  test('should select item with Enter key', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();

    // Select the default active item with Enter
    const activeItem = page.locator('[data-command-item][data-active]');
    await expect(activeItem).toHaveCount(1);
    const activeValue = await activeItem.getAttribute('data-value');
    expect(activeValue).toBeTruthy();

    await input.press('Enter');

    await expect(page.getByTestId('last-selected')).toHaveText(activeValue as string);
  });

  // ---------- Groups ----------

  test('should render groups with heading and correct roles', async ({ page }) => {
    const groups = page.locator('[data-command-group]');
    expect(await groups.count()).toBeGreaterThan(0);

    const firstGroup = groups.first();
    await expect(firstGroup).toHaveAttribute('role', 'group');

    // The basic demo's groups all have headings
    const heading = firstGroup.locator('[data-command-group-heading]');
    await expect(heading).toHaveCount(1);
    const headingId = await heading.getAttribute('id');
    expect(headingId).toBeTruthy();
    await expect(firstGroup).toHaveAttribute('aria-labelledby', headingId as string);
  });

  // ---------- Page Navigation ----------

  test('should not render a page container when no pages are configured', async ({ page }) => {
    // The basic demo declares no Command.Page, so no page container is rendered
    await expect(page.locator('[data-command-page]')).toHaveCount(0);
  });

  // ---------- Dialog Mode ----------

  test('should open and close dialog with animation states', { tag: '@dialog' }, async ({
    page,
  }) => {
    await open(page, '/dialog');

    // Dialog should initially be closed
    const dialog = page.locator('[data-command-dialog]');

    // Trigger open with the dialog demo's trigger button
    await page.locator('[data-command-trigger]').click();

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
  });

  test('should open dialog with Ctrl+K keyboard shortcut', { tag: '@dialog' }, async ({ page }) => {
    await open(page, '/dialog');

    // Press Ctrl+K to open
    await page.keyboard.press('Control+k');

    const dialog = page.locator('[data-command-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-state', 'open');

    // Input inside dialog should be focused
    const input = page.getByRole('combobox');
    await expect(input).toBeFocused();
  });

  // ---------- Cross-Browser Consistency ----------

  test('should maintain consistent item count across renders', async ({ page }) => {
    // beforeEach waited for the root only; wait for options to render before reading the count
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    const initialCount = await options.count();
    expect(initialCount).toBeGreaterThan(0);

    // Navigate away and back: the settled page must render the same number of options
    await open(page, '/');
    await expect(page.locator('[data-command-root]')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(initialCount);
  });

  test('should handle rapid search input without errors', async ({ page }) => {
    const input = page.getByRole('combobox');

    // 50 ms between keys; a dropped key here is a Command.Input bug, not a reason to slow typing
    await input.pressSequentially('testing rapid input', { delay: 50 });
    await expect(input).toHaveValue('testing rapid input');

    // Clear and type again
    await input.press('Control+a');
    await input.press('Backspace');
    await expect(input).toHaveValue('');

    await input.pressSequentially('another query', { delay: 50 });
    await expect(input).toHaveValue('another query');
  });

  test('should preserve focus on input during filtering', async ({ page }) => {
    const input = page.getByRole('combobox');
    await input.focus();
    await expect(input).toBeFocused();

    await input.pressSequentially('test', { delay: 50 });

    // Focus should remain on the input after filtering
    await expect(input).toBeFocused();
  });

  test('should register the palette on the devtools registry in a dev build', async ({ page }) => {
    // The playground runs `vite dev` against the built package, so this exercises the
    // NODE_ENV-gated devtools bridge exactly as a consumer's dev server does.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const registry = (globalThis as Record<string, unknown>).__CRIMSON_COMMAND_DEVTOOLS__;
          return registry instanceof Map ? [...registry.keys()] : null;
        }),
      )
      .toEqual(['basic']);
  });

  test('should not have JavaScript errors in console', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Interact with the page
    const input = page.getByRole('combobox');
    await input.focus();
    await input.pressSequentially('test', { delay: 50 });
    await input.press('ArrowDown');
    await input.press('ArrowUp');
    await input.press('Enter');

    expect(errors).toEqual([]);
  });
});

test('TEB-104: no e2e request leaves the playground origin', async ({
  page,
  offOriginRequests,
}) => {
  const routes = [
    '/',
    '/dialog',
    '/virtualization?count=2000',
    '/all-states',
    '/rtl',
    '/error-boundary',
    '/dark-mode',
    '/high-contrast',
  ];
  for (const route of routes) {
    await open(page, route);
  }
  expect(offOriginRequests, 'requests left the playground origin').toEqual([]);
});

test('TEB-104: both font faces are loaded when the first demo renders', async ({ page }) => {
  await page.addInitScript(() => {
    const probe = globalThis as unknown as { __loadedFaces?: string[] };
    const observer = new MutationObserver(() => {
      if (!document.getElementById('root')?.firstElementChild) return;
      probe.__loadedFaces = [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => face.family.replaceAll('"', ''));
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await open(page, '/virtualization?count=2000');
  const loaded = await page.evaluate(
    () => (globalThis as unknown as { __loadedFaces?: string[] }).__loadedFaces,
  );
  expect([...new Set(loaded)].sort()).toEqual(['Inter Variable', 'JetBrains Mono Variable']);
});
