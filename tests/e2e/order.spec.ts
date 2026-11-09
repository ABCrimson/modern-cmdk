import { expect, open, test } from './fixtures';

type Page = Parameters<typeof open>[0];

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

// On the Basic demo (route `/`) the query `e` ranks Extensions first, so Settings leads the
// groups (Settings, Actions, Suggestions) where the empty query lists Suggestions, Actions, Settings
const REORDERING_QUERY = 'e';

test.describe('A11Y-03, RA-02: the listbox order is the order the arrow keys walk', () => {
  const enabledOptionIds = (page: Page): Promise<string[]> =>
    page
      .getByRole('option')
      .evaluateAll((els) =>
        els.filter((el) => el.getAttribute('aria-disabled') !== 'true').map((el) => el.id),
      );

  const groupHeadings = (page: Page): Promise<string[]> =>
    page
      .locator('[data-command-group-heading]')
      .evaluateAll((els) => els.map((el) => el.textContent ?? ''));

  /** Presses ArrowDown once per enabled option from the first one, calling `visit` after each press. */
  const walk = async (
    page: Page,
    count: number,
    visit: (activeId: string) => Promise<void>,
  ): Promise<string[]> => {
    const active = page.locator('[data-command-item][data-active]');
    const input = page.getByRole('combobox');
    const walked: string[] = [];
    for (let i = 0; i < count; i++) {
      if (i > 0) await input.press('ArrowDown');
      // The press has landed once the active id differs from the previous step's (none before the first)
      await expect(active).not.toHaveId(walked.at(-1) ?? '');
      await expect(active).toHaveCount(1);
      const id = await active.evaluate((el) => el.id);
      walked.push(id);
      await visit(id);
    }
    return walked;
  };

  test('A11Y-03: DOM order equals navigation order in the playground after a search that reorders the groups', async ({
    page,
  }) => {
    await open(page, '/');
    const input = page.getByRole('combobox');
    expect(await groupHeadings(page)).toEqual(['Suggestions', 'Actions', 'Settings']);

    await input.fill(REORDERING_QUERY);
    await expect.poll(() => groupHeadings(page)).toEqual(['Settings', 'Actions', 'Suggestions']);

    const domOrder = await enabledOptionIds(page);
    expect(domOrder.length).toBeGreaterThan(3);
    await input.press('Home');
    await expect(page.locator('[data-command-item][data-active]')).toHaveId(domOrder[0] ?? '');
    const walked = await walk(page, domOrder.length, async () => {});
    expect(walked).toEqual(domOrder);
  });

  test('RA-02: the active option moves down the screen with each ArrowDown after a reordering search', async ({
    page,
  }) => {
    await open(page, '/');
    const input = page.getByRole('combobox');
    await input.fill(REORDERING_QUERY);
    await expect.poll(() => groupHeadings(page)).toEqual(['Settings', 'Actions', 'Suggestions']);

    const domOrder = await enabledOptionIds(page);
    const count = domOrder.length;
    await input.press('Home');
    await expect(page.locator('[data-command-item][data-active]')).toHaveId(domOrder[0] ?? '');
    const tops: number[] = [];
    await walk(page, count, async (id) => {
      // The list scrolls the active option into view, so measure from the top of the list's content
      const top = await page.locator(`[id="${id}"]`).evaluate((el) => {
        const list = el.closest('[data-command-list]');
        return (
          el.getBoundingClientRect().top -
          (list?.getBoundingClientRect().top ?? 0) +
          (list?.scrollTop ?? 0)
        );
      });
      tops.push(top);
    });
    expect(tops).toHaveLength(count);
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i], `option ${i} lies below option ${i - 1}`).toBeGreaterThan(tops[i - 1] ?? 0);
    }
  });

  test('A11Y-03: DOM order equals navigation order after the search is cleared', async ({
    page,
  }) => {
    await open(page, '/');
    const input = page.getByRole('combobox');
    await input.fill(REORDERING_QUERY);
    await expect.poll(() => groupHeadings(page)).toEqual(['Settings', 'Actions', 'Suggestions']);
    await input.fill('');
    await expect.poll(() => groupHeadings(page)).toEqual(['Suggestions', 'Actions', 'Settings']);

    const domOrder = await enabledOptionIds(page);
    await input.press('Home');
    await expect(page.locator('[data-command-item][data-active]')).toHaveId(domOrder[0] ?? '');
    const walked = await walk(page, domOrder.length, async () => {});
    expect(walked).toEqual(domOrder);
  });
});
