import type { ParsedShortcut } from 'modern-cmdk';
import {
  createCommandMachine,
  detectConflicts,
  findMatchingShortcut,
  formatShortcut,
  itemId,
  KeyboardShortcutRegistry,
  matchesShortcut,
  parseShortcut,
} from 'modern-cmdk';
import { describe, expect, it, vi } from 'vitest';

type ParseCase = {
  readonly shortcut: string;
  readonly expected: Partial<ParsedShortcut>;
};

const simpleCases: readonly ParseCase[] = [
  {
    shortcut: 'k',
    expected: { key: 'k', meta: false, ctrl: false, shift: false, alt: false },
  },
];

const modifierCases: readonly ParseCase[] = [
  { shortcut: 'Shift+A', expected: { key: 'a', shift: true, alt: false } },
  { shortcut: 'Alt+N', expected: { key: 'n', shift: false, alt: true } },
];

const multiModifierCases: readonly ParseCase[] = [
  { shortcut: 'Ctrl+Shift+P', expected: { key: 'p', ctrl: true, shift: true } },
];

const caseInsensitiveCases: readonly ParseCase[] = [
  { shortcut: 'ctrl+k', expected: { key: 'k', ctrl: true } },
];

describe('parseShortcut', () => {
  // Data-driven: simple key parsing
  it.for(simpleCases)('should parse simple key "$shortcut"', ({ shortcut, expected }) => {
    const result = parseShortcut(shortcut);
    // Vitest — soft assertions for multi-property checks
    expect.soft(result.key).toBe(expected.key);
    expect.soft(result.meta).toBe(expected.meta);
    expect.soft(result.ctrl).toBe(expected.ctrl);
    expect.soft(result.shift).toBe(expected.shift);
    expect.soft(result.alt).toBe(expected.alt);
  });

  it('should parse Mod+Key', () => {
    const result = parseShortcut('Mod+K');
    expect(result.key).toBe('k');
    // Mod resolves to meta on Mac, ctrl on Windows
    expect(result.meta || result.ctrl).toBe(true);
  });

  // Data-driven: single modifier tests
  it.for(modifierCases)('should parse modifier in "$shortcut"', ({ shortcut, expected }) => {
    const result = parseShortcut(shortcut);
    expect(result.key).toBe(expected.key);
    expect(result.shift).toBe(expected.shift);
    expect(result.alt).toBe(expected.alt);
  });

  // Data-driven: multi-modifier tests
  it.for(multiModifierCases)(
    'should parse multiple modifiers in "$shortcut"',
    ({ shortcut, expected }) => {
      const result = parseShortcut(shortcut);
      expect.soft(result.ctrl).toBe(expected.ctrl);
      expect.soft(result.shift).toBe(expected.shift);
      expect.soft(result.key).toBe(expected.key);
    },
  );

  it('should normalize consistently', () => {
    const a = parseShortcut('Ctrl+Shift+K');
    const b = parseShortcut('Shift+Ctrl+K');
    expect(a.normalized).toBe(b.normalized);
  });

  // Data-driven: case-insensitive
  it.for(caseInsensitiveCases)(
    'should handle case-insensitive modifiers: "$shortcut"',
    ({ shortcut, expected }) => {
      const result = parseShortcut(shortcut);
      expect(result.ctrl).toBe(true);
      expect(result.key).toBe(expected.key);
    },
  );
});

describe('matchesShortcut', () => {
  function makeEvent(
    key: string,
    modifiers: Partial<{
      metaKey: boolean;
      ctrlKey: boolean;
      shiftKey: boolean;
      altKey: boolean;
    }> = {},
  ): KeyboardEvent {
    return new KeyboardEvent('keydown', {
      key,
      metaKey: modifiers.metaKey ?? false,
      ctrlKey: modifiers.ctrlKey ?? false,
      shiftKey: modifiers.shiftKey ?? false,
      altKey: modifiers.altKey ?? false,
    });
  }

  it('should match simple key', () => {
    const shortcut = parseShortcut('k');
    const event = makeEvent('k');
    expect(matchesShortcut(event, shortcut)).toBe(true);
  });

  it('should not match with extra modifiers', () => {
    const shortcut = parseShortcut('k');
    const event = makeEvent('k', { ctrlKey: true });
    expect(matchesShortcut(event, shortcut)).toBe(false);
  });

  it('should match Ctrl+K', () => {
    const shortcut = parseShortcut('Ctrl+K');
    const event = makeEvent('k', { ctrlKey: true });
    expect(matchesShortcut(event, shortcut)).toBe(true);
  });

  it('should match Ctrl+Shift+P', () => {
    const shortcut = parseShortcut('Ctrl+Shift+P');
    const event = makeEvent('p', { ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(event, shortcut)).toBe(true);
  });

  it('should not match wrong key', () => {
    const shortcut = parseShortcut('Ctrl+K');
    const event = makeEvent('j', { ctrlKey: true });
    expect(matchesShortcut(event, shortcut)).toBe(false);
  });
});

describe('findMatchingShortcut()', () => {
  function keydown(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, ...modifiers });
  }

  it('T11: returns the parsed shortcut itself (same reference) that the event matches', () => {
    const open = parseShortcut('Ctrl+K');
    const other = parseShortcut('Ctrl+J');
    expect(findMatchingShortcut(keydown('k', { ctrlKey: true }), [other, open])).toBe(open);
  });

  it('T11: returns null when no shortcut matches, and for an empty list', () => {
    const shortcuts = [parseShortcut('Ctrl+K'), parseShortcut('Shift+P')];
    expect(findMatchingShortcut(keydown('x', { ctrlKey: true }), shortcuts)).toBeNull();
    expect(findMatchingShortcut(keydown('k'), [])).toBeNull();
  });

  it('T11: compares all four modifiers exactly, so an extra or a missing modifier is no match', () => {
    const ctrlK = parseShortcut('Ctrl+K');
    expect(
      findMatchingShortcut(keydown('k', { ctrlKey: true, shiftKey: true }), [ctrlK]),
    ).toBeNull();
    expect(findMatchingShortcut(keydown('k', { ctrlKey: true, altKey: true }), [ctrlK])).toBeNull();
    expect(
      findMatchingShortcut(keydown('k', { ctrlKey: true, metaKey: true }), [ctrlK]),
    ).toBeNull();
    expect(findMatchingShortcut(keydown('k'), [ctrlK])).toBeNull();
    // The modifier aliases parse to the same four flags the event is compared on
    expect(
      findMatchingShortcut(keydown('k', { metaKey: true }), [parseShortcut('Cmd+K')]),
    ).not.toBeNull();
    expect(
      findMatchingShortcut(keydown('n', { altKey: true }), [parseShortcut('Option+N')]),
    ).not.toBeNull();
  });

  it('T11: lower-cases the event key, so Shift+K matches an event whose key is the capital K', () => {
    const shiftK = parseShortcut('Shift+K');
    expect(findMatchingShortcut(keydown('K', { shiftKey: true }), [shiftK])).toBe(shiftK);
  });

  it('T11: with several matching candidates the first in list order wins', () => {
    const first = parseShortcut('Ctrl+K');
    const duplicate = parseShortcut('ctrl+k');
    const event = keydown('k', { ctrlKey: true });
    expect(findMatchingShortcut(event, [first, duplicate])).toBe(first);
    expect(findMatchingShortcut(event, [duplicate, first])).toBe(duplicate);
  });
});

describe('detectConflicts', () => {
  it('should detect duplicate bindings', () => {
    const shortcuts = [parseShortcut('Ctrl+K'), parseShortcut('Ctrl+K'), parseShortcut('Ctrl+J')];

    const conflicts = detectConflicts(shortcuts);
    expect(conflicts.size).toBe(1);
  });

  it('should return empty map with no conflicts', () => {
    const shortcuts = [parseShortcut('Ctrl+K'), parseShortcut('Ctrl+J'), parseShortcut('Ctrl+L')];

    const conflicts = detectConflicts(shortcuts);
    expect(conflicts.size).toBe(0);
  });
});

describe('KeyboardShortcutRegistry conflicts (CE-08, DAE-32)', () => {
  const press = (key: string): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true }));
  };
  const a = itemId('a');
  const b = itemId('b');

  it('CE-08: a second item under the same normalized shortcut is reported by getConflicts()', () => {
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, () => {});
    registry.register('ctrl+k', b, () => {});
    const conflicts = registry.getConflicts();
    expect([...conflicts.keys()]).toEqual([parseShortcut('Ctrl+K').normalized]);
    expect(conflicts.get(parseShortcut('Ctrl+K').normalized)).toHaveLength(2);
  });

  it('CE-08: the later binding wins the keydown', () => {
    const first = vi.fn();
    const second = vi.fn();
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, first);
    registry.register('Ctrl+K', b, second);
    press('k');
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(registry.getBindings().get(parseShortcut('Ctrl+K').normalized)?.itemId).toBe(b);
  });

  it('CE-08: disposing the later binding restores the earlier one and clears the conflict', () => {
    const first = vi.fn();
    const second = vi.fn();
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, first);
    const later = registry.register('Ctrl+K', b, second);
    later[Symbol.dispose]();
    expect(registry.getConflicts().size).toBe(0);
    press('k');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('CE-08: unregisterByItem of the later item restores the earlier binding', () => {
    const first = vi.fn();
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, first);
    registry.register('Ctrl+K', b, () => {});
    registry.unregisterByItem(b);
    expect(registry.getConflicts().size).toBe(0);
    press('k');
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('CE-08: disposing the earlier binding leaves the later one bound', () => {
    const second = vi.fn();
    using registry = new KeyboardShortcutRegistry();
    const earlier = registry.register('Ctrl+K', a, () => {});
    registry.register('Ctrl+K', b, second);
    earlier[Symbol.dispose]();
    expect(registry.getConflicts().size).toBe(0);
    press('k');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('CE-08: the same item registered again under the same shortcut replaces its own binding and is no conflict', () => {
    const old = vi.fn();
    const current = vi.fn();
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, old);
    registry.register('Ctrl+K', a, current);
    expect(registry.getConflicts().size).toBe(0);
    expect(registry.getBindings().size).toBe(1);
    press('k');
    expect(current).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
  });

  it('CE-08: unregister(shortcut) removes every binding of that key', () => {
    const handler = vi.fn();
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, handler);
    registry.register('Ctrl+K', b, handler);
    registry.unregister('ctrl+k');
    expect(registry.getBindings().size).toBe(0);
    expect(registry.getConflicts().size).toBe(0);
    press('k');
    expect(handler).not.toHaveBeenCalled();
  });

  it('unregisterByItem touches only the stacks of that item: none for an unbound item, one for an item with one key', () => {
    using registry = new KeyboardShortcutRegistry();
    for (let i = 0; i < 200; i++) {
      registry.register(`Ctrl+Alt+k${i}`, itemId(`i${i}`), () => {});
    }
    const filter = vi.spyOn(Array.prototype, 'filter');
    try {
      registry.unregisterByItem(itemId('unbound'));
      expect(filter).not.toHaveBeenCalled();
      registry.unregisterByItem(itemId('i7'));
      expect(filter).toHaveBeenCalledTimes(1);
    } finally {
      filter.mockRestore();
    }
    expect(registry.getBindings().size).toBe(199);
  });

  it('unregisterByItem removes every key of an item bound under two shortcuts, and only that item', () => {
    const other = vi.fn();
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, () => {});
    registry.register('Ctrl+J', a, () => {});
    registry.register('Ctrl+K', b, other);
    registry.unregisterByItem(a);
    expect([...registry.getBindings().keys()]).toEqual([parseShortcut('Ctrl+K').normalized]);
    press('k');
    expect(other).toHaveBeenCalledTimes(1);
    registry.unregisterByItem(b);
    expect(registry.getBindings().size).toBe(0);
  });

  it('unregister(shortcut) leaves no stale key for the items it removed: unregisterByItem afterwards is a no-op', () => {
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, () => {});
    registry.unregister('Ctrl+K');
    registry.register('Ctrl+K', b, () => {});
    const filter = vi.spyOn(Array.prototype, 'filter');
    try {
      registry.unregisterByItem(a);
      expect(filter).not.toHaveBeenCalled();
    } finally {
      filter.mockRestore();
    }
    expect(registry.getBindings().get(parseShortcut('Ctrl+K').normalized)?.itemId).toBe(b);
  });

  it('CE-08: disposing a later binding drops its index entry while an earlier binding on the key stays', () => {
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, () => {});
    const later = registry.register('Ctrl+K', b, () => {});
    later[Symbol.dispose]();
    const filter = vi.spyOn(Array.prototype, 'filter');
    try {
      registry.unregisterByItem(b);
      expect(filter).not.toHaveBeenCalled();
    } finally {
      filter.mockRestore();
    }
    expect(registry.getBindings().get(parseShortcut('Ctrl+K').normalized)?.itemId).toBe(a);
  });

  it('DAE-32: two Command items with the same shortcut are reported by the machine keyboard registry', () => {
    using machine = createCommandMachine({
      items: [
        { id: a, value: 'A', shortcut: 'Ctrl+K', onSelect: () => {} },
        { id: b, value: 'B', shortcut: 'Ctrl+K', onSelect: () => {} },
      ],
    });
    const conflicts = machine.getKeyboardRegistry().getConflicts();
    expect(conflicts.get(parseShortcut('Ctrl+K').normalized)?.length).toBe(2);
  });
});

describe('formatShortcut', () => {
  it('should format simple key', () => {
    const formatted = formatShortcut(parseShortcut('k'));
    expect(formatted).toContain('K');
  });

  it('should format modifier+key', () => {
    const formatted = formatShortcut(parseShortcut('Ctrl+K'));
    expect(formatted.length).toBeGreaterThan(1);
  });
});
