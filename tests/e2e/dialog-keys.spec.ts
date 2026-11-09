// tests/e2e/dialog-keys.spec.ts
// Command.Dialog's keys and focus in a real browser (cluster C3): the palette's keydown handler
// hangs on Dialog.Content, so a key pressed while focus sits on the content itself still drives it,
// and closing the dialog returns focus to the element that opened it.

import { expect, open, test } from './fixtures';

test.describe('Command.Dialog keys and focus', () => {
  test("C3: in the browser, ArrowDown after a click on the dialog's padding moves the active item", {
    tag: '@dialog',
  }, async ({ page }) => {
    await open(page, '/dialog');
    await page.locator('[data-command-trigger]').click();
    const dialog = page.locator('[data-command-dialog]');
    await expect(page.getByRole('combobox')).toBeFocused();

    const items = page.locator('[data-command-item]');
    await expect(items.first()).toHaveAttribute('data-active', '');

    // The dialog element is `pointer-events: none` outside its content, so a click on its own
    // padding would reach the overlay. A group heading is the pointer target that moves focus off
    // the input without a focusable element of its own: the nearest focusable ancestor is
    // Dialog.Content, which FocusScope renders with tabIndex -1.
    await page.locator('[data-command-group-heading]').first().click();
    await expect(dialog).toBeFocused();

    await page.keyboard.press('ArrowDown');

    await expect(items.nth(1)).toHaveAttribute('data-active', '');
    await expect(items.first()).not.toHaveAttribute('data-active', '');
  });

  test('A11Y-02: in the browser, Escape closes /dialog and focus returns to its trigger', {
    tag: '@dialog',
  }, async ({ page }) => {
    await open(page, '/dialog');
    const trigger = page.locator('[data-command-trigger]');
    await trigger.click();
    await expect(page.getByRole('combobox')).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(page.locator('[data-command-dialog]')).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
