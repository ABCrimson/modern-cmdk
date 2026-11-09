// tests/unit/dialog-focus.test.tsx
// <Command.Dialog>'s keys and focus (cluster C3): the palette handles keys from Dialog.Content and
// from nowhere else, closing the dialog returns focus to the element that opened it (also from
// inside a shadow root), and the content is marked modal.

import type { CommandMachine } from 'modern-cmdk';
import type { CommandDialogProps } from 'modern-cmdk/react';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use, useState } from 'react';
import { createPortal } from 'react-dom';
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

/** Mounts `ui` in a fresh container and flushes the first render. */
async function mount(ui: ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const current = root;
  await act(async () => {
    current.render(ui);
  });
}

/** Runs the scheduler frames, Radix's deferred listeners and the effects that follow an interaction. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** Dispatches a keydown the way a browser does: bubbling and cancelable, on `target`. */
async function press(target: Element, key: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => {
    target.dispatchEvent(event);
  });
  await settle();
  return event;
}

/** Records the machine the dialog's subtree holds. */
class MachineProbe {
  machine: CommandMachine | undefined;

  /** Probe child: place it inside `<Command.Dialog>`. */
  readonly Probe = (): null => {
    const stable = use(CommandStableContext);
    if (stable) this.machine = stable.machine;
    return null;
  };

  /** The recorded machine; throws before the probe has rendered. */
  get current(): CommandMachine {
    if (!this.machine) throw new Error('probe never rendered');
    return this.machine;
  }
}

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`nothing matches ${selector}`);
  return element;
};

/** The text of the active item. */
const activeText = (): string | null =>
  document.querySelector('[data-command-item][data-active]')?.textContent ?? null;

/** The dialog's children: an input and three items. */
const Palette = ({
  probe,
  autoFocus,
}: {
  readonly probe?: MachineProbe | undefined;
  readonly autoFocus?: boolean | undefined;
}): ReactNode => (
  <>
    {probe ? <probe.Probe /> : null}
    <Command.Input autoFocus={autoFocus} />
    <Command.List>
      <Command.Item value="alpha">Alpha</Command.Item>
      <Command.Item value="bravo">Bravo</Command.Item>
      <Command.Item value="charlie">Charlie</Command.Item>
    </Command.List>
  </>
);

/** A parent that owns the dialog's `open` state and hands its setter to `parent`. */
function Controlled({
  parent,
  initialOpen = true,
  probe,
  keepOpen = false,
  onOpenChange,
  opener,
  props,
  autoFocus,
}: {
  readonly parent?: { setOpen: (open: boolean) => void };
  readonly initialOpen?: boolean;
  readonly probe?: MachineProbe;
  readonly keepOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly opener?: ReactNode;
  readonly props?: Pick<CommandDialogProps, 'keyboardScope'>;
  readonly autoFocus?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(initialOpen);
  if (parent) parent.setOpen = setOpen;
  return (
    <>
      {opener}
      <Command.Dialog
        open={open}
        onOpenChange={(next: boolean): void => {
          onOpenChange?.(next);
          if (!keepOpen) setOpen(next);
        }}
        {...props}
      >
        <Palette probe={probe} autoFocus={autoFocus} />
      </Command.Dialog>
    </>
  );
}

describe('Command.Dialog keys, scope and focus', () => {
  it('C3: ArrowDown with focus on Dialog.Content moves the active item', async () => {
    await mount(<Controlled />);
    await settle();
    const content = query<HTMLElement>('[data-command-dialog]');
    content.focus();
    expect(document.activeElement).toBe(content);
    expect(activeText()).toBe('Alpha');

    const event = await press(content, 'ArrowDown');

    expect(event.defaultPrevented).toBe(true);
    expect(activeText()).toBe('Bravo');
  });

  it("A11Y-17: Escape inside the dialog is handled once, by Radix; the palette's handler sees defaultPrevented and returns", async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    // The parent refuses to close: a CLOSE the palette sent itself would be a second report
    await mount(<Controlled probe={probe} onOpenChange={onOpenChange} keepOpen />);
    await settle();
    const input = query<HTMLInputElement>('[data-command-input]');
    input.focus();

    using send = vi.spyOn(probe.current, 'send');
    const event = await press(input, 'Escape');

    expect(event.defaultPrevented).toBe(true);
    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(send.mock.calls.map(([sent]) => sent.type)).not.toContain('CLOSE');
    expect(probe.current.getState().open).toBe(true);
  });

  it('A11Y-02: closing the dialog returns focus to the element that opened it', async () => {
    const parent = { setOpen: (_open: boolean): void => undefined };
    await mount(
      <Controlled
        parent={parent}
        initialOpen={false}
        opener={
          <button type="button" id="opener">
            Open
          </button>
        }
      />,
    );
    const opener = query<HTMLButtonElement>('#opener');
    opener.focus();
    expect(document.activeElement).toBe(opener);
    await act(async () => {
      parent.setOpen(true);
    });
    await settle();
    const input = query<HTMLInputElement>('[data-command-input]');
    expect(document.activeElement).toBe(input);

    await press(input, 'Escape');

    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('A11Y-02: with an autoFocus input, closing the dialog returns focus to the element that opened it', async () => {
    const parent = { setOpen: (_open: boolean): void => undefined };
    await mount(
      <Controlled
        parent={parent}
        initialOpen={false}
        autoFocus
        opener={
          <button type="button" id="opener">
            Open
          </button>
        }
      />,
    );
    const opener = query<HTMLButtonElement>('#opener');
    opener.focus();
    expect(document.activeElement).toBe(opener);
    await act(async () => {
      parent.setOpen(true);
    });
    await settle();
    const input = query<HTMLInputElement>('[data-command-input]');
    expect(document.activeElement).toBe(input);

    await press(input, 'Escape');

    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('A11Y-02: an opener inside an open shadow root gets focus back after the dialog closes', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const parent = { setOpen: (_open: boolean): void => undefined };
    try {
      await mount(
        <Controlled
          parent={parent}
          initialOpen={false}
          opener={createPortal(
            <button type="button" id="shadow-opener">
              Open
            </button>,
            shadow,
          )}
        />,
      );
      const opener = shadow.querySelector<HTMLButtonElement>('#shadow-opener');
      if (!opener) throw new Error('the shadow opener did not render');
      opener.focus();
      expect(shadow.activeElement).toBe(opener);
      await act(async () => {
        parent.setOpen(true);
      });
      await settle();
      const input = query<HTMLInputElement>('[data-command-input]');
      expect(document.activeElement).toBe(input);

      await press(input, 'Escape');

      expect(document.querySelector('[data-command-dialog]')).toBeNull();
      expect(document.activeElement).toBe(host);
      expect(shadow.activeElement).toBe(opener);
    } finally {
      await act(async () => {
        root?.unmount();
      });
      root = undefined;
      host.remove();
    }
  });

  it('A11Y-39: Command.Dialog content carries aria-modal true', async () => {
    await mount(<Controlled />);
    await settle();
    const content = query<HTMLElement>('[data-command-dialog]');

    expect(content.getAttribute('role')).toBe('dialog');
    expect(content.getAttribute('aria-modal')).toBe('true');
  });

  it('C3: with keyboardScope="combobox", ArrowDown on Dialog.Content does nothing while ArrowDown on the input moves', async () => {
    await mount(<Controlled props={{ keyboardScope: 'combobox' }} />);
    await settle();
    const content = query<HTMLElement>('[data-command-dialog]');
    content.focus();
    expect(activeText()).toBe('Alpha');

    const onContent = await press(content, 'ArrowDown');

    expect(onContent.defaultPrevented).toBe(false);
    expect(activeText()).toBe('Alpha');

    const onInput = await press(query<HTMLInputElement>('[data-command-input]'), 'ArrowDown');

    expect(onInput.defaultPrevented).toBe(true);
    expect(activeText()).toBe('Bravo');
  });

  it('C3: a key dispatched on an element outside Dialog.Content while the dialog is open does not drive the palette', async () => {
    const outside = document.createElement('button');
    outside.type = 'button';
    document.body.appendChild(outside);
    try {
      await mount(<Controlled />);
      await settle();
      expect(activeText()).toBe('Alpha');

      const event = await press(outside, 'ArrowDown');

      expect(event.defaultPrevented).toBe(false);
      expect(activeText()).toBe('Alpha');
    } finally {
      outside.remove();
    }
  });
});
