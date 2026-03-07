import { describe, it, expect } from 'vitest';
import {
  parseShortcut,
  matchesShortcut,
  detectConflicts,
  formatShortcut,
} from '@crimson_dev/command';

describe('parseShortcut', () => {
  it('should parse simple key', () => {
    const result = parseShortcut('k');
    expect(result.key).toBe('k');
    expect(result.meta).toBe(false);
    expect(result.ctrl).toBe(false);
    expect(result.shift).toBe(false);
    expect(result.alt).toBe(false);
  });

  it('should parse Mod+Key', () => {
    const result = parseShortcut('Mod+K');
    expect(result.key).toBe('k');
    // Mod resolves to meta on Mac, ctrl on Windows
    expect(result.meta || result.ctrl).toBe(true);
  });

  it('should parse Shift modifier', () => {
    const result = parseShortcut('Shift+A');
    expect(result.shift).toBe(true);
    expect(result.key).toBe('a');
  });

  it('should parse Alt/Option modifier', () => {
    const result = parseShortcut('Alt+N');
    expect(result.alt).toBe(true);
    expect(result.key).toBe('n');
  });

  it('should parse multiple modifiers', () => {
    const result = parseShortcut('Ctrl+Shift+P');
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(true);
    expect(result.key).toBe('p');
  });

  it('should normalize consistently', () => {
    const a = parseShortcut('Ctrl+Shift+K');
    const b = parseShortcut('Shift+Ctrl+K');
    expect(a.normalized).toBe(b.normalized);
  });

  it('should handle case-insensitive modifiers', () => {
    const result = parseShortcut('ctrl+k');
    expect(result.ctrl).toBe(true);
    expect(result.key).toBe('k');
  });
});

describe('matchesShortcut', () => {
  function makeEvent(key: string, modifiers: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }> = {}): KeyboardEvent {
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
    const shortcuts = [
      parseShortcut('Ctrl+K'),
      parseShortcut('Ctrl+K'),
      parseShortcut('Ctrl+J'),
    ];

    const conflicts = detectConflicts(shortcuts);
    expect(conflicts.size).toBe(1);
  });

  it('should return empty map with no conflicts', () => {
    const shortcuts = [
      parseShortcut('Ctrl+K'),
      parseShortcut('Ctrl+J'),
      parseShortcut('Ctrl+L'),
    ];

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
