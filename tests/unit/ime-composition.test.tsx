// tests/unit/ime-composition.test.tsx
// Keys pressed while an input method composes text (cluster C3): the palette neither selects, moves,
// pops a page nor closes, and an item shortcut fires nothing, until the composition has ended.

import type { CommandState } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { Command, createKeydownHandler } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act } from 'react';
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
  init: KeyboardEventInit,
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
  });
  await settle();
  return event;
}

/** Dispatches a composition event on `target`. */
const compose = (target: Element, type: 'compositionstart' | 'compositionend'): Promise<void> =>
  act(async () => {
    target.dispatchEvent(new CompositionEvent(type, { bubbles: true }));
  });

/** The keydown a browser sends for a key that is part of a composition (Chrome and Firefox). */
const COMPOSING = { isComposing: true, keyCode: 229 } as const;
/** The keydown that commits a composition in Safari: `isComposing` is already false. */
const SAFARI_COMMIT = { isComposing: false, keyCode: 229 } as const;

/** The input the palette renders. */
const inputOf = (): HTMLInputElement => {
  const input = container?.querySelector<HTMLInputElement>('[data-command-input]');
  if (!input) throw new Error('no command input rendered');
  return input;
};

/** The id of the item that carries `data-active`, or undefined. */
const activeItem = (): string | undefined =>
  container?.querySelector('[data-command-item][data-active]')?.id;

/** An inline palette with three items whose `onSelect` is the given spy. */
function palette(onSelect: (id: string) => void): ReactNode {
  return (
    <Command>
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

const frame = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 50));

describe('IME composition', () => {
  it("IME: a Korean composition's Enter does not select", async () => {
    const onSelect = vi.fn();
    await mount(palette(onSelect));
    const input = inputOf();
    input.focus();
    expect(activeItem()).toBe('a');

    await compose(input, 'compositionstart');
    // Hangul syllables build up behind keydowns whose key is "Process"
    for (let syllable = 0; syllable < 3; syllable++) {
      const step = await press(input, 'Process', COMPOSING);
      expect(step.defaultPrevented).toBe(false);
    }
    // Chrome and Firefox: the Enter that commits the syllable still carries isComposing
    const chrome = await press(input, 'Enter', COMPOSING);
    // Safari: the commit's keydown arrives after isComposing went false
    const safari = await press(input, 'Enter', SAFARI_COMMIT);
    expect(onSelect).not.toHaveBeenCalled();
    expect(chrome.defaultPrevented).toBe(false);
    expect(safari.defaultPrevented).toBe(false);

    // The composition is over: the same key is a real Enter
    await compose(input, 'compositionend');
    const real = await press(input, 'Enter', { keyCode: 13 });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(real.defaultPrevented).toBe(true);
  });

  it('IME: a Japanese candidate Enter does not select', async () => {
    const onSelect = vi.fn();
    await mount(palette(onSelect));
    const input = inputOf();
    input.focus();

    await compose(input, 'compositionstart');
    // Romaji typed, then Space opens the candidate list: both are composing keydowns
    await press(input, 'Process', COMPOSING);
    await press(input, 'Process', COMPOSING);
    // Enter confirms the candidate
    const chrome = await press(input, 'Enter', COMPOSING);
    const safari = await press(input, 'Enter', SAFARI_COMMIT);
    expect(onSelect).not.toHaveBeenCalled();
    expect(chrome.defaultPrevented).toBe(false);
    expect(safari.defaultPrevented).toBe(false);

    await compose(input, 'compositionend');
    await press(input, 'Enter', { keyCode: 13 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('IME: a Chinese candidate ArrowDown does not move', async () => {
    const onSelect = vi.fn();
    await mount(palette(onSelect));
    const input = inputOf();
    input.focus();
    expect(activeItem()).toBe('a');

    await compose(input, 'compositionstart');
    await press(input, 'Process', COMPOSING);
    // ArrowDown walks the pinyin candidate list
    const chrome = await press(input, 'ArrowDown', COMPOSING);
    const safari = await press(input, 'ArrowDown', SAFARI_COMMIT);
    expect(activeItem()).toBe('a');
    expect(chrome.defaultPrevented).toBe(false);
    expect(safari.defaultPrevented).toBe(false);

    await compose(input, 'compositionend');
    const real = await press(input, 'ArrowDown', { keyCode: 40 });
    expect(activeItem()).toBe('b');
    expect(real.defaultPrevented).toBe(true);
  });

  it('IME: an item shortcut pressed during composition fires no onSelect', async () => {
    const onSelect = vi.fn();
    await mount(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item value="a" forceId="a" shortcut="Ctrl+K" onSelect={onSelect}>
            a
          </Command.Item>
        </Command.List>
      </Command>,
    );
    const input = inputOf();
    input.focus();

    await compose(input, 'compositionstart');
    await press(input, 'k', { ctrlKey: true, ...COMPOSING });
    await press(input, 'k', { ctrlKey: true, ...SAFARI_COMMIT });
    expect(onSelect).not.toHaveBeenCalled();

    await compose(input, 'compositionend');
    await press(input, 'k', { ctrlKey: true, keyCode: 75 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('RA-15: the keydown handler ignores keys during IME composition', async () => {
    const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', 'Backspace', 'Escape'];
    const snapshot = (s: CommandState): string =>
      JSON.stringify([s.activeId, s.open, s.search, s.pageStack]);
    for (const composing of [{ isComposing: true }, { keyCode: 229 }] as const) {
      const onSelect = vi.fn();
      const onOpenChange = vi.fn();
      using machine = createCommandMachine({
        open: true,
        onOpenChange,
        onSelect,
        items: ['a', 'b', 'c'].map((id) => ({ id: itemId(id), value: id })),
      });
      const handler = createKeydownHandler(machine, () => machine.getState());
      machine.send({ type: 'PAGE_PUSH', page: 'sub' });
      machine.send({ type: 'NAVIGATE', direction: 'next' });
      await frame();
      const before = snapshot(machine.getState());
      expect(machine.getState().pageStack).toEqual(['root']);
      expect(machine.getState().open).toBe(true);
      expect(machine.getState().activeId).not.toBeNull();

      for (const key of keys) {
        const event = new KeyboardEvent('keydown', { key, cancelable: true, ...composing });
        handler(event);
        expect(event.defaultPrevented, `${key} ${JSON.stringify(composing)}`).toBe(false);
      }
      await frame();
      expect(snapshot(machine.getState())).toBe(before);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();

      // The guard is not over-broad: the same machine and handler act on a plain ArrowUp
      const plain = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
      handler(plain);
      expect(plain.defaultPrevented).toBe(true);
    }
  });
});
