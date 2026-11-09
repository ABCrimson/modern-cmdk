// Which keydowns reach the shortcut registry (IME, default-prevented, editable targets, scope), when it holds a
// document listener, and how a keydown matches a shortcut across keyboard layouts.

import type { CommandItem, CommandMachine } from 'modern-cmdk';
import {
  createCommandMachine,
  findMatchingShortcut,
  itemId,
  KeyboardShortcutRegistry,
  matchesShortcut,
  parseShortcut,
} from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const noop = (): void => {};

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

/** A keydown whose `getModifierState('AltGraph')` reports true (happy-dom answers with `altKey`) */
function altGraph(init: KeyboardEventInit): KeyboardEvent {
  const event = keydown(init);
  event.getModifierState = (name: string): boolean => name === 'AltGraph';
  return event;
}

/** The `keydown` listener registrations a spy on `document.addEventListener` or `removeEventListener` saw */
function keydownCalls(spy: { readonly mock: { readonly calls: readonly unknown[][] } }): number {
  return spy.mock.calls.filter(([type]) => type === 'keydown').length;
}

function append<T extends Element>(element: T, parent: Element = document.body): T {
  parent.append(element);
  return element;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('registry keydown guards', () => {
  it('CE-10: a registry skips a keydown during IME composition', () => {
    using registry = new KeyboardShortcutRegistry();
    const handler = vi.fn();
    registry.register('Ctrl+K', itemId('k'), handler);

    const composing = keydown({ key: 'k', ctrlKey: true, isComposing: true });
    document.dispatchEvent(composing);
    const legacy = keydown({ key: 'k', ctrlKey: true, isComposing: false, keyCode: 229 });
    document.dispatchEvent(legacy);
    expect(handler).not.toHaveBeenCalled();
    expect(composing.defaultPrevented).toBe(false);
    expect(legacy.defaultPrevented).toBe(false);

    document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('CE-10: a registry skips a keydown another handler default-prevented', () => {
    using registry = new KeyboardShortcutRegistry();
    const handler = vi.fn();
    registry.register('Ctrl+K', itemId('k'), handler);
    const field = append(document.createElement('div'));
    const claim = (event: Event): void => event.preventDefault();
    field.addEventListener('keydown', claim);

    field.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    expect(handler).not.toHaveBeenCalled();

    field.removeEventListener('keydown', claim);
    field.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('CE-10: the shortcut registry skips composing and default-prevented keydowns', () => {
    const onSelect = vi.fn();
    using _machine = createCommandMachine({
      items: [{ id: itemId('k'), value: 'Kill', shortcut: 'Ctrl+K', onSelect }],
    });
    const field = append(document.createElement('div'));
    const claim = (event: Event): void => event.preventDefault();

    document.dispatchEvent(keydown({ key: 'k', ctrlKey: true, isComposing: true }));
    field.addEventListener('keydown', claim);
    field.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    expect(onSelect).not.toHaveBeenCalled();

    field.removeEventListener('keydown', claim);
    field.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('shortcutsInEditable', () => {
  const copy = (onSelect: () => void, shortcutsInEditable: boolean): CommandMachine =>
    createCommandMachine({
      shortcutsInEditable,
      items: [{ id: itemId('copy'), value: 'Copy', shortcut: 'Ctrl+C', onSelect }],
    });
  const ctrlC = (): KeyboardEvent => keydown({ key: 'c', ctrlKey: true, composed: true });

  it('DAE-61: with shortcutsInEditable false, Mod+C in an unrelated input is not intercepted and Mod+C in the palette input still fires', () => {
    const onSelect = vi.fn();
    using _machine = copy(onSelect, false);
    const unrelated = append(document.createElement('input'));
    const palette = append(document.createElement('input'));
    palette.setAttribute('data-command-input', '');

    const blocked = ctrlC();
    unrelated.dispatchEvent(blocked);
    expect(onSelect).not.toHaveBeenCalled();
    expect(blocked.defaultPrevented).toBe(false);

    const fired = ctrlC();
    palette.dispatchEvent(fired);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(fired.defaultPrevented).toBe(true);
  });

  it('DAE-61: with shortcutsInEditable false, a textarea, a select, contenteditable and an input inside a shadow root are editable, contenteditable="false" is not', () => {
    const onSelect = vi.fn();
    using _machine = copy(onSelect, false);
    const host = append(document.createElement('div'));
    const inShadow = append(
      document.createElement('input'),
      host.attachShadow({ mode: 'open' }) as unknown as Element,
    );
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const notEditable = document.createElement('div');
    notEditable.setAttribute('contenteditable', 'false');
    const targets = [
      append(document.createElement('textarea')),
      append(document.createElement('select')),
      append(editable),
      inShadow,
    ];

    for (const target of targets) {
      const event = ctrlC();
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(onSelect).not.toHaveBeenCalled();

    append(notEditable).dispatchEvent(ctrlC());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('shortcutScope', () => {
  it("A11Y-06: with shortcutScope 'root', a shortcut does not fire from outside the palette", async () => {
    const onSelect = vi.fn();
    const container = append(document.createElement('div'));
    const outside = append(document.createElement('button'));
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          Command,
          { shortcutScope: 'root' },
          createElement(Command.Input),
          createElement(
            Command.List,
            null,
            createElement(
              Command.Item,
              { value: 'a', forceId: 'a', shortcut: 'Ctrl+K', onSelect },
              'A',
            ),
          ),
        ),
      );
    });
    await act(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    const blocked = keydown({ key: 'k', ctrlKey: true });
    outside.dispatchEvent(blocked);
    expect(onSelect).not.toHaveBeenCalled();
    expect(blocked.defaultPrevented).toBe(false);

    const input = container.querySelector('input') as HTMLInputElement;
    const fired = keydown({ key: 'k', ctrlKey: true });
    input.dispatchEvent(fired);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(fired.defaultPrevented).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it("A11Y-06: shortcutScope 'root' fires inside Command.Dialog's content", async () => {
    const onSelect = vi.fn();
    const outside = append(document.createElement('button'));
    const container = append(document.createElement('div'));
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          Command.Dialog,
          { open: true, shortcutScope: 'root' },
          createElement(Command.Input),
          createElement(
            Command.List,
            null,
            createElement(
              Command.Item,
              { value: 'a', forceId: 'a', shortcut: 'Ctrl+K', onSelect },
              'A',
            ),
          ),
        ),
      );
    });
    await act(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    const blocked = keydown({ key: 'k', ctrlKey: true });
    outside.dispatchEvent(blocked);
    expect(onSelect).not.toHaveBeenCalled();

    const input = document.querySelector('[data-command-input]') as HTMLInputElement;
    input.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it("A11Y-06: shortcutScope 'root' with no root element fires nothing, and the default 'document' scope fires from anywhere", () => {
    const items = (onSelect: () => void): CommandItem[] => [
      { id: itemId('a'), value: 'A', shortcut: 'Ctrl+K', onSelect },
    ];
    const scoped = vi.fn();
    const open = vi.fn();
    using _rooted = createCommandMachine({ shortcutScope: 'root', items: items(scoped) });
    document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    append(document.createElement('button')).dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    expect(scoped).not.toHaveBeenCalled();

    using _document = createCommandMachine({ items: items(open) });
    append(document.createElement('button')).dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    expect(open).toHaveBeenCalledTimes(1);
    document.dispatchEvent(keydown({ key: 'k', ctrlKey: true }));
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('document listener lifetime', () => {
  it('CE-44: a registry with no bindings holds no document listener', () => {
    const add = vi.spyOn(document, 'addEventListener');
    using registry = new KeyboardShortcutRegistry();
    using _machine = createCommandMachine({ items: [{ id: itemId('a'), value: 'A' }] });
    registry.suspend();
    registry.resume();
    expect(keydownCalls(add)).toBe(0);
  });

  it('CE-44: resume() with no binding attaches nothing; register() after dispose attaches nothing', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const registry = new KeyboardShortcutRegistry();
    registry.suspend();
    registry.resume();
    expect(keydownCalls(add)).toBe(0);

    registry[Symbol.dispose]();
    registry.register('Ctrl+K', itemId('k'), noop);
    registry.resume();
    expect(keydownCalls(add)).toBe(0);
  });

  it('CE-44: the listener attaches at the first binding and detaches at the last removal on every path, and a binding added while suspended attaches at resume()', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    using registry = new KeyboardShortcutRegistry();
    const a = itemId('a');
    const b = itemId('b');

    // the per-binding disposer
    const first = registry.register('Ctrl+K', a, noop);
    const second = registry.register('Ctrl+J', b, noop);
    expect([keydownCalls(add), keydownCalls(remove)]).toEqual([1, 0]);
    first[Symbol.dispose]();
    expect(keydownCalls(remove)).toBe(0);
    second[Symbol.dispose]();
    expect([keydownCalls(add), keydownCalls(remove)]).toEqual([1, 1]);

    // unregister
    registry.register('Ctrl+K', a, noop);
    expect(keydownCalls(add)).toBe(2);
    registry.unregister('Ctrl+K');
    expect(keydownCalls(remove)).toBe(2);

    // unregisterByItem
    registry.register('Ctrl+K', a, noop);
    registry.register('Ctrl+J', a, noop);
    expect(keydownCalls(add)).toBe(3);
    registry.unregisterByItem(a);
    expect(keydownCalls(remove)).toBe(3);

    // a binding added while suspended waits for resume()
    registry.suspend();
    registry.register('Ctrl+K', a, noop);
    expect(keydownCalls(add)).toBe(3);
    registry.resume();
    expect(keydownCalls(add)).toBe(4);
    registry.resume();
    expect(keydownCalls(add)).toBe(4);
  });
});

describe('matching through event.code', () => {
  it('CE-11: a shortcut matches through event.code when event.key is layout-dependent', () => {
    const shift1 = parseShortcut('Shift+1', 'other');
    expect(matchesShortcut(keydown({ key: '!', code: 'Digit1', shiftKey: true }), shift1)).toBe(
      true,
    );
    const space = parseShortcut('Space', 'other');
    expect(matchesShortcut(keydown({ key: ' ', code: 'Space' }), space)).toBe(true);
    const ctrlK = parseShortcut('Ctrl+K', 'other');
    expect(matchesShortcut(keydown({ key: 'л', code: 'KeyK', ctrlKey: true }), ctrlK)).toBe(true);
    // the modifiers are still compared exactly
    expect(matchesShortcut(keydown({ key: 'л', code: 'KeyK' }), ctrlK)).toBe(false);
  });

  it("A11Y-21: Alt+K matches the macOS Option+K keydown (key '˚', code KeyK) and Mod+` matches through event.code", () => {
    const altK = parseShortcut('Alt+K', 'mac');
    expect(matchesShortcut(keydown({ key: '˚', code: 'KeyK', altKey: true }), altK)).toBe(true);
    const modTick = parseShortcut('Mod+`', 'mac');
    expect(
      matchesShortcut(keydown({ key: 'Dead', code: 'Backquote', metaKey: true }), modTick),
    ).toBe(true);
    expect(matchesShortcut(keydown({ key: '²', code: 'Backquote', metaKey: true }), modTick)).toBe(
      true,
    );
  });

  it("CE-11: AZERTY Ctrl+A (key 'a', code KeyQ) does not fire Mod+Q", () => {
    const event = keydown({ key: 'a', code: 'KeyQ', ctrlKey: true });
    expect(matchesShortcut(event, parseShortcut('Mod+Q', 'other'))).toBe(false);
    expect(matchesShortcut(event, parseShortcut('Mod+A', 'other'))).toBe(true);
  });

  it('CE-11: QWERTZ Ctrl+Y does not fire Mod+Z', () => {
    const event = keydown({ key: 'y', code: 'KeyZ', ctrlKey: true });
    expect(matchesShortcut(event, parseShortcut('Mod+Z', 'other'))).toBe(false);
    expect(matchesShortcut(event, parseShortcut('Mod+Y', 'other'))).toBe(true);
  });

  it("CE-11: AltGr+Q ('@', code KeyQ) does not fire Q", () => {
    const q = parseShortcut('Q', 'other');
    expect(matchesShortcut(altGraph({ key: '@', code: 'KeyQ' }), q)).toBe(false);
    // a non-ASCII AltGr glyph would fall back through its code, and the AltGraph state blocks that
    const e = parseShortcut('E', 'other');
    expect(matchesShortcut(altGraph({ key: '€', code: 'KeyE' }), e)).toBe(false);
  });

  it('CE-11: AZERTY Ctrl+& (Digit1) fires Mod+1', () => {
    const event = keydown({ key: '&', code: 'Digit1', ctrlKey: true });
    expect(matchesShortcut(event, parseShortcut('Mod+1', 'other'))).toBe(true);
  });

  it('CE-11: a binding matched through event.key wins over one matched only through event.code', () => {
    // AZERTY, no modifier: the key is '&' and the code is Digit1, so '1' matches through the code only
    const event = keydown({ key: '&', code: 'Digit1' });
    const byKey = parseShortcut('&', 'other');
    const byCode = parseShortcut('1', 'other');

    expect(findMatchingShortcut(event, [byCode, byKey])).toBe(byKey);
    expect(findMatchingShortcut(event, [byKey, byCode])).toBe(byKey);
    expect(findMatchingShortcut(event, [byCode])).toBe(byCode);

    for (const order of [
      ['&', '1'],
      ['1', '&'],
    ] as const) {
      using registry = new KeyboardShortcutRegistry();
      const handlers = { '&': vi.fn(), '1': vi.fn() };
      for (const shortcut of order)
        registry.register(shortcut, itemId(shortcut), handlers[shortcut]);
      document.dispatchEvent(keydown({ key: '&', code: 'Digit1' }));
      expect(handlers['&']).toHaveBeenCalledTimes(1);
      expect(handlers['1']).not.toHaveBeenCalled();
    }
  });
});
