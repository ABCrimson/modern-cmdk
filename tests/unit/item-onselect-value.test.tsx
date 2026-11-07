// tests/unit/item-onselect-value.test.tsx
// ARCH-62 (LD-05, D66): <Command.Item onSelect> is called with no argument in 1.x; the value argument is a 2.0 change

import { act, cleanup, render } from '@testing-library/react';
import type { CommandItem as CoreItem } from 'modern-cmdk';
import { Command, type CommandItemProps } from 'modern-cmdk/react';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

afterEach(cleanup);

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

function mount(onSelect: () => void, shortcut?: string): HTMLElement {
  const { container } = render(
    <Command label="test">
      <Command.Input />
      <Command.List>
        <Command.Item value="x" onSelect={onSelect} {...(shortcut !== undefined && { shortcut })}>
          X
        </Command.Item>
      </Command.List>
    </Command>,
  );
  return container;
}

describe('ARCH-62 Command.Item onSelect()', () => {
  it('ARCH-62: onSelect is called with no argument on click', async () => {
    const onSelect = vi.fn<() => void>();
    const container = mount(onSelect);
    await settle();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-command-item]')?.click();
    });
    await settle();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]).toEqual([]);
  });

  it('ARCH-62: onSelect is called with no argument on Enter', async () => {
    const onSelect = vi.fn<() => void>();
    const container = mount(onSelect);
    await settle();
    await act(async () => {
      container
        .querySelector('[data-command-root]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await settle();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]).toEqual([]);
  });

  it('ARCH-62: onSelect is called with no argument on its shortcut', async () => {
    const onSelect = vi.fn<() => void>();
    mount(onSelect, 'Shift+K');
    await settle();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'K', shiftKey: true, bubbles: true }),
      );
    });
    await settle();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]).toEqual([]);
  });

  it('ARCH-62: a (force?: boolean) => void handler type-checks as onSelect, and the core item type is unchanged', () => {
    expectTypeOf<CommandItemProps['onSelect']>().toEqualTypeOf<(() => void) | undefined>();
    const toggle = (_force?: boolean): void => undefined;
    expect(<Command.Item value="b" onSelect={toggle} />).toBeDefined();
    expectTypeOf<CoreItem['onSelect']>().toEqualTypeOf<(() => void) | undefined>();
  });
});
