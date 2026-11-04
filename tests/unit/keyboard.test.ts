import { detectConflicts, formatShortcut, matchesShortcut, parseShortcut } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

type ParseCase = {
  readonly shortcut: string;
  readonly expected: Readonly<Record<string, string | boolean>>;
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
