import { expect, open, test } from './fixtures';

test.describe('RA-88: virtual rows and the virtualizer agree on the row pitch', () => {
  test("RA-88: a virtual row renders at the virtualizer's pitch in every engine", async ({
    page,
  }) => {
    await open(page, '/virtualization?count=2000');
    const input = page.getByRole('combobox');
    await input.focus();
    for (let i = 0; i < 30; i++) {
      await input.press('ArrowDown');
    }

    const list = page.locator('[data-command-list]');
    const rows = page.locator('[data-command-list-virtual] [data-command-item]');
    await expect(rows.first()).toBeVisible();

    // The virtualizer places row i at i * pitch (item.tsx applies it with `translate`), so the
    // gap between two consecutive rows is the pitch every row box has to fill
    await expect
      .poll(async () => {
        const boxes = await rows.evaluateAll((els) =>
          els.map((el) => ({
            height: el.getBoundingClientRect().height,
            offset: Number.parseFloat(getComputedStyle(el).translate.split(' ')[1] ?? 'NaN'),
          })),
        );
        const pitches = boxes.slice(1).map((box, i) => box.offset - (boxes[i]?.offset ?? 0));
        const pitch = pitches[0] ?? Number.NaN;
        const uniform = pitches.every((gap) => gap === pitch);
        return uniform && boxes.length > 1 && boxes.every((box) => box.height === pitch);
      })
      .toBe(true);

    // The active row lies inside the list's own viewport
    const active = page.locator('[data-command-list-virtual] [data-command-item][data-active]');
    await expect(active).toBeVisible();
    await expect
      .poll(async () => {
        const [row, view] = await Promise.all([
          active.evaluate((el) => el.getBoundingClientRect()),
          list.evaluate((el) => el.getBoundingClientRect()),
        ]);
        return row.top >= view.top && row.bottom <= view.bottom;
      })
      .toBe(true);
  });
});
