import { detectConflicts, formatShortcut, matchesShortcut, parseShortcut } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

// ES2026 Object.groupBy — organize parse test cases by category
const parseTestCases: Partial<
  Record<
    string,
    { shortcut: string; expected: Record<string, string | boolean>; category: string }[]
  >
> = Object.groupBy(
  [
    {
      shortcut: 'k',
      expected: { key: 'k', meta: false, ctrl: false, shift: false, alt: false },
      category: 'simple',
    },
    { shortcut: 'Shift+A', expected: { key: 'a', shift: true }, category: 'modifier' },
    { shortcut: 'Alt+N', expected: { key: 'n', alt: true }, category: 'modifier' },
    {
      shortcut: 'Ctrl+Shift+P',
      expected: { key: 'p', ctrl: true, shift: true },
      category: 'multi-modifier',
    },
    { shortcut: 'ctrl+k', expected: { key: 'k', ctrl: true }, category: 'case-insensitive' },
  ],
  (t) => t.category,
);

describe('parseShortcut', () => {
  // Data-driven: simple key parsing
  for (const testCase of parseTestCases.simple ?? []) {
    it(`should parse simple key "${testCase.shortcut}"`, () => {
      const result = parseShortcut(testCase.shortcut);
      // Vitest 4.1 — soft assertions for multi-property checks
      expect.soft(result.key).toBe(testCase.expected.key);
      expect.soft(result.meta).toBe(testCase.expected.meta);
      expect.soft(result.ctrl).toBe(testCase.expected.ctrl);
      expect.soft(result.shift).toBe(testCase.expected.shift);
      expect.soft(result.alt).toBe(testCase.expected.alt);
    });
  }

  it('should parse Mod+Key', () => {
    const result = parseShortcut('Mod+K');
    expect(result.key).toBe('k');
    // Mod resolves to meta on Mac, ctrl on Windows
    expect(result.meta || result.ctrl).toBe(true);
  });

  // Data-driven: single modifier tests
  for (const testCase of parseTestCases.modifier ?? []) {
    it(`should parse modifier in "${testCase.shortcut}"`, () => {
      const result = parseShortcut(testCase.shortcut);
      expect(result.key).toBe(testCase.expected.key);
      if (testCase.expected.shift) expect(result.shift).toBe(true);
      if (testCase.expected.alt) expect(result.alt).toBe(true);
    });
  }

  // Data-driven: multi-modifier tests
  for (const testCase of parseTestCases['multi-modifier'] ?? []) {
    it(`should parse multiple modifiers in "${testCase.shortcut}"`, () => {
      const result = parseShortcut(testCase.shortcut);
      expect.soft(result.ctrl).toBe(testCase.expected.ctrl);
      expect.soft(result.shift).toBe(testCase.expected.shift);
      expect.soft(result.key).toBe(testCase.expected.key);
    });
  }

  it('should normalize consistently', () => {
    const a = parseShortcut('Ctrl+Shift+K');
    const b = parseShortcut('Shift+Ctrl+K');
    expect(a.normalized).toBe(b.normalized);
  });

  // Data-driven: case-insensitive
  for (const testCase of parseTestCases['case-insensitive'] ?? []) {
    it(`should handle case-insensitive modifiers: "${testCase.shortcut}"`, () => {
      const result = parseShortcut(testCase.shortcut);
      expect(result.ctrl).toBe(true);
      expect(result.key).toBe(testCase.expected.key);
    });
  }
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
