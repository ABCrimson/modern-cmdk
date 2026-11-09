// tests/unit/shortcut-platform.test.ts
// formatShortcut labels and parseShortcut's plus key — Vitest + happy-dom

import { formatShortcut, matchesShortcut, parseShortcut } from 'modern-cmdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

const other = (s: string): string => formatShortcut(parseShortcut(s, 'other'), 'other');
const mac = (s: string): string => formatShortcut(parseShortcut(s, 'mac'), 'mac');

describe('formatShortcut labels', () => {
  it('CE-12: formatShortcut labels meta as Meta and ctrl as Ctrl off macOS', () => {
    expect(other('Meta+K')).toBe('Meta+K');
    expect(other('Cmd+K')).toBe('Meta+K');
    expect(other('Meta+Ctrl+K')).toBe('Meta+Ctrl+K');
    expect(other('Mod+K')).toBe('Ctrl+K');
    expect(other('Ctrl+Shift+Alt+K')).toBe('Ctrl+Shift+Alt+K');
    expect(other('Meta+Shift+Alt+K')).toBe('Meta+Shift+Alt+K');
  });

  it('DG-68: Meta+K is labelled Meta+K off macOS', () => {
    expect(other('Meta+K')).toBe('Meta+K');
    expect(mac('Meta+K')).toBe('⌘K');
  });

  it('A11Y-20: a Cmd+K item is labelled Meta+K off macOS, not Ctrl+K', () => {
    expect(other('Cmd+K')).toBe('Meta+K');
    expect(other('Cmd+K')).not.toBe('Ctrl+K');
  });

  it('CE-42: formatShortcut labels named keys (↑, PageDown, Esc)', () => {
    expect(mac('ArrowUp')).toBe('↑');
    expect(mac('ArrowDown')).toBe('↓');
    expect(mac('ArrowLeft')).toBe('←');
    expect(mac('ArrowRight')).toBe('→');
    expect(other('ArrowUp')).toBe('↑');
    expect(other('Ctrl+PageDown')).toBe('Ctrl+PageDown');
    expect(other('Ctrl+PageUp')).toBe('Ctrl+PageUp');
    expect(mac('Mod+Escape')).toBe('⌘Esc');
    expect(other('Escape')).toBe('Esc');
    expect(other('Enter')).toBe('Enter');
    expect(other('Space')).toBe('Space');
    expect(other('F1')).toBe('F1');
  });

  it('CE-41: formatShortcut orders the macOS glyphs ⌃⌥⇧⌘ (Mod+Alt+Shift+K is ⌥⇧⌘K)', () => {
    expect(mac('Mod+Alt+Shift+K')).toBe('⌥⇧⌘K');
    expect(mac('Ctrl+Meta+K')).toBe('⌃⌘K');
    expect(mac('Ctrl+Alt+Shift+Meta+K')).toBe('⌃⌥⇧⌘K');
    expect(mac('Mod+K')).toBe('⌘K');
    expect(mac('Shift+K')).toBe('⇧K');
  });

  it('CE-42: a key named like an Object.prototype member renders capitalised', () => {
    // parseShortcut lower-cases and resolves modifiers by table, so build the parsed shapes directly
    for (const key of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']) {
      const p = { ...parseShortcut('k', 'other'), key };
      const want = key.charAt(0).toUpperCase() + key.slice(1);
      expect(formatShortcut(p, 'other')).toBe(want);
      expect(formatShortcut(p, 'mac')).toBe(want);
    }
  });
});

describe('parseShortcut plus key', () => {
  it('CE-40: Ctrl++ and Ctrl+Plus bind the plus key', () => {
    for (const s of ['Ctrl++', 'Ctrl+Plus']) {
      const parsed = parseShortcut(s, 'other');
      expect(parsed.key).toBe('+');
      expect(parsed.ctrl).toBe(true);
      expect(parsed.normalized).toBe('ctrl++');
      expect(
        matchesShortcut(new KeyboardEvent('keydown', { key: '+', ctrlKey: true }), parsed),
      ).toBe(true);
    }
  });

  it('TUB-18: parseShortcut edge cases: a trailing plus, Plus, surrounding spaces, letter case and a lone key', () => {
    expect(parseShortcut('+', 'other').key).toBe('+');
    expect(parseShortcut('Plus', 'other').key).toBe('+');
    expect(parseShortcut('PLUS', 'other').key).toBe('+');
    const spaced = parseShortcut('  Shift + Plus ', 'other');
    expect(spaced.key).toBe('+');
    expect(spaced.shift).toBe(true);
    expect(spaced.normalized).toBe('shift++');
    const cased = parseShortcut('CTRL+shift+K', 'other');
    expect(cased.normalized).toBe('ctrl+shift+k');
    expect(parseShortcut('k', 'other').normalized).toBe('k');
  });
});

describe('platform detection without an argument', () => {
  it('TUB-17: without a platform argument, Mod and the labels follow navigator (MacIntel is ⌘K, Win32 is Ctrl+K)', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    vi.resetModules();
    let m = await import('modern-cmdk');
    expect(m.parseShortcut('Mod+K').meta).toBe(true);
    expect(m.formatShortcut(m.parseShortcut('Mod+K'))).toBe('⌘K');

    vi.stubGlobal('navigator', { platform: 'Win32' });
    vi.resetModules();
    m = await import('modern-cmdk');
    expect(m.parseShortcut('Mod+K').ctrl).toBe(true);
    expect(m.formatShortcut(m.parseShortcut('Mod+K'))).toBe('Ctrl+K');

    vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgentData: { platform: 'macOS' } });
    vi.resetModules();
    m = await import('modern-cmdk');
    expect(m.parseShortcut('Mod+K').meta).toBe(true);
    expect(m.formatShortcut(m.parseShortcut('Mod+K'))).toBe('⌘K');
  });
});

describe('parseShortcut part names', () => {
  it('RA-89: parseShortcut treats constructor and __proto__ as plain keys', () => {
    // toString, hasOwnProperty and valueOf are guards: lower-casing already takes them off
    // Object.prototype
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      const key = name.toLowerCase();
      expect(parseShortcut(name, 'other')).toMatchObject({
        key,
        meta: false,
        ctrl: false,
        shift: false,
        alt: false,
      });
      expect(parseShortcut(`Ctrl+${name}`, 'other')).toMatchObject({
        key,
        meta: false,
        ctrl: true,
        shift: false,
        alt: false,
      });
    }
  });
});
