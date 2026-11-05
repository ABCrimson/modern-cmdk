// tests/unit/item-onselect-value.test.tsx
// ARCH-11 (onSelect half): <Command.Item onSelect> receives the item's value

import { act, cleanup, render } from '@testing-library/react';
import type { CommandItem as CoreItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

afterEach(cleanup);

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

function mount(onSelect: (value: string) => void, shortcut?: string): HTMLElement {
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

describe('ARCH-11 Command.Item onSelect(value)', () => {
  it('ARCH-11: onSelect receives the item value on click', async () => {
    const fn = vi.fn();
    const container = mount(fn);
    await settle();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-command-item]')?.click();
    });
    await settle();
    expect(fn).toHaveBeenCalledWith('x');
  });

  it('ARCH-11: onSelect receives the item value on Enter', async () => {
    const fn = vi.fn();
    const container = mount(fn);
    await settle();
    await act(async () => {
      container
        .querySelector('[data-command-root]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await settle();
    expect(fn).toHaveBeenCalledWith('x');
  });

  it('ARCH-11: onSelect receives the item value on its shortcut', async () => {
    const fn = vi.fn();
    mount(fn, 'Shift+K');
    await settle();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'K', shiftKey: true, bubbles: true }),
      );
    });
    await settle();
    expect(fn).toHaveBeenCalledWith('x');
  });

  it('ARCH-11: a () => void handler still type-checks and the core item type is unchanged', () => {
    const noArgs: () => void = () => undefined;
    expect(<Command.Item value="y" onSelect={noArgs} />).toBeDefined();
    expectTypeOf<CoreItem['onSelect']>().toEqualTypeOf<(() => void) | undefined>();
  });
});
