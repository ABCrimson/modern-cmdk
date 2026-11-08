// tests/unit/input-typing.test.tsx
// Command.Input keeps every keystroke under rapid typing (ledger T48).
// The machine applies SEARCH_CHANGE on its scheduler tick (rAF in browsers), so a controlled
// value read straight from machine state lags the DOM and React restores the stale value.

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommandMachine } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { use } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TYPED = 'abcdefghijklmnopqrstuvwxy'; // 25 characters

interface Palette {
  readonly input: HTMLInputElement;
  readonly machine: () => CommandMachine;
}

/** Captures the root's machine so a test can read its state or send events. */
function Probe({ onMachine }: { readonly onMachine: (machine: CommandMachine) => void }): null {
  const stable = use(CommandStableContext);
  if (stable) onMachine(stable.machine);
  return null;
}

function renderPalette(): Palette {
  let captured: CommandMachine | null = null;
  const view = render(
    <Command label="Test">
      <Probe
        onMachine={(machine: CommandMachine): void => {
          captured = machine;
        }}
      />
      <Command.Input />
      <Command.List>
        <Command.Item value="alpha">Alpha</Command.Item>
      </Command.List>
    </Command>,
  );
  return {
    input: view.getByRole('combobox') as HTMLInputElement,
    machine: (): CommandMachine => {
      if (!captured) throw new Error('machine not captured');
      return captured;
    },
  };
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  });

describe('Command.Input rapid typing', () => {
  it('keeps all 25 characters at delay 0 and the machine converges on the typed string', async () => {
    const { input, machine } = renderPalette();
    const user = userEvent.setup({ delay: 0 });

    await user.click(input);
    await user.type(input, TYPED);
    expect(input.value).toBe(TYPED);

    await settle();
    expect(input.value).toBe(TYPED);
    expect(machine().getState().search).toBe(TYPED);
  });

  it('never lets the DOM value lag the last change event', async () => {
    const { input } = renderPalette();
    const user = userEvent.setup({ delay: 0 });
    const seen: string[] = [];
    input.addEventListener('input', () => {
      seen.push(input.value);
    });

    await user.click(input);
    for (const [index, char] of [...TYPED].entries()) {
      await user.keyboard(char);
      // After the event has been processed (act boundary), the DOM holds exactly what was typed.
      expect(input.value).toBe(TYPED.slice(0, index + 1));
    }
    expect(seen).toEqual([...TYPED].map((_, index) => TYPED.slice(0, index + 1)));
  });

  it('keeps typed characters while the machine tick has not run yet', async () => {
    // Hold every animation frame: the machine scheduler (rAF in browsers) cannot apply SEARCH_CHANGE
    // until the test releases the frames, which is the worst case of the browser flake.
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const { input, machine } = renderPalette();
    const user = userEvent.setup({ delay: 0 });

    await user.click(input);
    for (const [index, char] of [...TYPED].entries()) {
      await user.keyboard(char);
      expect(input.value).toBe(TYPED.slice(0, index + 1));
    }
    expect(machine().getState().search).toBe('');

    await act(async () => {
      for (const frame of frames.splice(0)) frame(performance.now());
    });
    expect(machine().getState().search).toBe(TYPED);
    expect(input.value).toBe(TYPED);
  });

  it('follows an external search change once nothing typed is in flight', async () => {
    const { input, machine } = renderPalette();
    await act(async () => {
      machine().send({ type: 'SEARCH_CHANGE', query: 'external' });
    });
    await settle();
    expect(input.value).toBe('external');
  });

  it('does not mistake a later external search for a stale echo (type then Backspace in one frame)', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const release = (): Promise<void> =>
      act(async () => {
        for (const frame of frames.splice(0)) frame(performance.now());
      });
    const { input, machine } = renderPalette();
    const user = userEvent.setup({ delay: 0 });

    await user.click(input);
    await release();
    await user.keyboard('a{Backspace}');
    expect(input.value).toBe('');
    await release();
    expect(machine().getState().search).toBe('');

    act(() => {
      machine().send({ type: 'SEARCH_CHANGE', query: 'a' });
    });
    await release();
    expect(machine().getState().search).toBe('a');
    expect(input.value).toBe('a');
  });

  it('keeps typed characters when an optimistic active-item render lands between keystrokes', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const release = (): Promise<void> =>
      act(async () => {
        for (const frame of frames.splice(0)) frame(performance.now());
      });
    const view = render(
      <Command label="Test">
        <Command.Input />
        <Command.List>
          <Command.Item value="alpha">Alpha</Command.Item>
          <Command.Item value="beta">Beta</Command.Item>
        </Command.List>
      </Command>,
    );
    const input = view.getByRole('combobox') as HTMLInputElement;
    const user = userEvent.setup({ delay: 0 });

    await release();
    await user.click(input);
    await release();
    await user.keyboard('a');
    await act(async () => {
      fireEvent.pointerMove(view.getByText('Beta'));
    });
    expect(input.value).toBe('a');
    await user.keyboard('b');
    await release();
    await release();
    expect(input.value).toBe('ab');
  });

  it('removes its machine subscription when the input unmounts', () => {
    let live = 0;
    const track = (machine: CommandMachine): void => {
      if ((machine as { __tracked?: true }).__tracked) return;
      (machine as { __tracked?: true }).__tracked = true;
      const subscribe = machine.subscribe.bind(machine);
      machine.subscribe = (listener: () => void): (() => void) => {
        live += 1;
        const unsubscribe = subscribe(listener);
        return (): void => {
          live -= 1;
          unsubscribe();
        };
      };
    };
    const tree = (withInput: boolean): ReactNode => (
      <Command label="Test">
        <Probe onMachine={track} />
        {withInput ? <Command.Input /> : null}
      </Command>
    );
    const view = render(tree(true));
    // The patched subscribe is a new function identity: one more render re-subscribes every store reader through it.
    view.rerender(tree(true));
    const withInput = live;
    expect(withInput).toBeGreaterThan(1);
    view.rerender(tree(false));
    expect(live).toBe(withInput - 1);
    view.unmount();
    expect(live).toBe(0);
  });

  it('never sets isPending for a search, so Command.Loading never mounts while typing', async () => {
    let appeared = false;
    const observer = new MutationObserver(() => {
      if (document.body.querySelector('[data-command-loading]')) appeared = true;
    });
    observer.observe(document.body, { subtree: true, childList: true });
    const view = render(
      <Command label="Test">
        <Command.Input />
        <Command.Loading>busy</Command.Loading>
        <Command.List>
          <Command.Item value="alpha">Alpha</Command.Item>
        </Command.List>
      </Command>,
    );
    const user = userEvent.setup({ delay: 0 });
    await user.click(view.getByRole('combobox'));
    await user.type(view.getByRole('combobox'), TYPED);
    await settle();
    observer.disconnect();
    expect(appeared).toBe(false);
  });

  it('ARCH-03: an edit in the middle of the text keeps the value and the caret', async () => {
    const { input, machine } = renderPalette();
    const user = userEvent.setup({ delay: 0 });
    await user.click(input);
    await user.type(input, 'apple');
    await settle();

    // Insert "x" at index 2 the way a browser does: the value changes, then the caret sits after the new character
    input.setSelectionRange(2, 2);
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setValue?.call(input, 'apxple');
      input.setSelectionRange(3, 3);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe('apxple');
    expect(input.selectionStart).toBe(3);

    await settle();
    expect(machine().getState().search).toBe('apxple');
    expect(input.value).toBe('apxple');
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
  });
});
