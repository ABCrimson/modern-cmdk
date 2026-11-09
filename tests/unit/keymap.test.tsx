// tests/unit/keymap.test.tsx
// The palette's keydown handler on an inline <Command> (cluster C3): modified Home and End belong
// to the input, an inline root that is not open leaves Escape alone, and a key that another handler
// default-prevented, or an Enter with no active item, changes nothing and is not default-prevented.

import type { CommandMachine } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

/** Runs the scheduler frames and the effects that follow an interaction. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** Mounts `ui` in a fresh container and flushes the first render and the machine's first frame. */
async function mount(ui: ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const current = root;
  await act(async () => {
    current.render(ui);
  });
  await settle();
}

/** Dispatches a bubbling, cancelable keydown on `target`, lets the machine run, and returns it. */
async function press(
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
  });
  await settle();
  return event;
}

/** The input the palette renders. */
const inputOf = (): HTMLInputElement => {
  const input = container?.querySelector<HTMLInputElement>('[data-command-input]');
  if (!input) throw new Error('no command input rendered');
  return input;
};

/** The id of the item that carries `data-active`, or undefined. */
const activeItem = (): string | undefined =>
  container?.querySelector('[data-command-item][data-active]')?.id;

/** Holds the machine of the palette that renders it. */
class MachineProbe {
  machine: CommandMachine | undefined;
  readonly Probe = (): null => {
    const stable = use(CommandStableContext);
    if (stable) this.machine = stable.machine;
    return null;
  };

  get current(): CommandMachine {
    if (!this.machine) throw new Error('probe never rendered');
    return this.machine;
  }
}

/** An inline palette with three items whose `onSelect` is the given spy. */
function palette(
  onSelect: (id: string) => void,
  probe?: MachineProbe,
  onOpenChange?: (open: boolean) => void,
): ReactNode {
  return (
    <Command onOpenChange={onOpenChange}>
      {probe ? <probe.Probe /> : null}
      <Command.Input />
      <Command.List>
        {['a', 'b', 'c'].map((id) => (
          <Command.Item key={id} value={id} forceId={id} onSelect={() => onSelect(id)}>
            {id}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}

describe('keymap', () => {
  it("RA-37: Shift+Home and Shift+End keep the input's text selection", async () => {
    await mount(palette(vi.fn()));
    const input = inputOf();
    input.focus();
    await press(input, 'ArrowDown');
    expect(activeItem()).toBe('b');

    for (const key of ['Home', 'End']) {
      for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
        const event = await press(input, key, { [modifier]: true });
        expect(event.defaultPrevented, `${modifier}+${key}`).toBe(false);
        expect(activeItem(), `${modifier}+${key}`).toBe('b');
      }
    }

    // Unmodified Home and End still navigate
    const home = await press(input, 'Home');
    expect(home.defaultPrevented).toBe(true);
    expect(activeItem()).toBe('a');
    const end = await press(input, 'End');
    expect(end.defaultPrevented).toBe(true);
    expect(activeItem()).toBe('c');
  });

  it('RA-38: Escape in an inline Command that is not open neither closes nor prevents the default', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    await mount(palette(vi.fn(), probe, onOpenChange));
    expect(probe.current.getState().open).toBe(false);
    const input = inputOf();
    input.focus();

    const event = await press(input, 'Escape');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('A11Y-14: a key another handler default-prevented is left alone', async () => {
    const onSelect = vi.fn();
    const probe = new MachineProbe();
    await mount(palette(onSelect, probe));
    const input = inputOf();
    input.focus();
    probe.current.send({ type: 'PAGE_PUSH', page: 'sub' });
    await settle();
    expect(probe.current.getState().pageStack).toEqual(['root']);
    expect(activeItem()).toBe('a');
    // A handler on the target itself runs before the event reaches the root or the document
    input.addEventListener('keydown', (event) => event.preventDefault());

    await press(input, 'ArrowDown');
    expect(activeItem()).toBe('a');
    await press(input, 'End');
    expect(activeItem()).toBe('a');
    await press(input, 'Enter');
    expect(onSelect).not.toHaveBeenCalled();
    await press(input, 'Backspace');
    expect(probe.current.getState().pageStack).toEqual(['root']);
  });

  it('A11Y-14: Enter with no active item is not default-prevented', async () => {
    const onSelect = vi.fn();
    const probe = new MachineProbe();
    await mount(palette(onSelect, probe));
    const input = inputOf();
    input.focus();

    // A query that matches nothing leaves no item active
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, 'zzz');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    expect(probe.current.getState().activeId).toBeNull();

    const event = await press(input, 'Enter');
    expect(event.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

/** The keyboardScope prop, reached through a cast until the prop exists on the root. */
const COMBOBOX = { keyboardScope: 'combobox' } as object;

/** An inline palette with a button next to the input; `props` reach the root. */
function buttonPalette(onSelect: (id: string) => void, props: object = {}): ReactNode {
  return (
    <Command {...props}>
      <Command.Input />
      <button type="button" id="nested">
        nested
      </button>
      <Command.List>
        {['a', 'b', 'c'].map((id) => (
          <Command.Item key={id} value={id} forceId={id} onSelect={() => onSelect(id)}>
            {id}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}

const nestedButton = (): HTMLButtonElement => {
  const button = container?.querySelector<HTMLButtonElement>('#nested');
  if (!button) throw new Error('no nested button rendered');
  return button;
};

describe('keymap scope and attachment', () => {
  it('A11Y-16: keyboardScope combobox ignores Enter on a button inside the palette', async () => {
    const onSelect = vi.fn();
    await mount(buttonPalette(onSelect, COMBOBOX));
    expect(activeItem()).toBe('a');

    const onButton = await press(nestedButton(), 'Enter');
    expect(onButton.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();

    const onInput = await press(inputOf(), 'Enter');
    expect(onInput.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('A11Y-16: the root scope warns once per root when a key is handled from a nested button', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await mount(buttonPalette(vi.fn()));
      const space = await press(nestedButton(), ' ');
      expect(space.defaultPrevented).toBe(false);
      await press(inputOf(), 'ArrowDown');
      expect(warn).not.toHaveBeenCalled();

      await press(nestedButton(), 'Enter');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('keyboardScope="combobox"');
      await press(nestedButton(), 'ArrowDown');
      expect(warn).toHaveBeenCalledTimes(1);

      warn.mockClear();
      await act(async () => {
        root?.unmount();
      });
      root = undefined;
      await mount(buttonPalette(vi.fn(), COMBOBOX));
      await press(nestedButton(), 'Enter');
      await press(inputOf(), 'ArrowDown');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('RA-57: a React ancestor that stops the keydown propagation does not silence the palette', async () => {
    await mount(
      // biome-ignore lint/a11y/noStaticElementInteractions: a stand-in for a consumer ancestor
      <div onKeyDown={(event): void => event.stopPropagation()}>{palette(vi.fn())}</div>,
    );
    expect(activeItem()).toBe('a');
    const event = await press(inputOf(), 'ArrowDown');
    expect(event.defaultPrevented).toBe(true);
    expect(activeItem()).toBe('b');
  });
});
