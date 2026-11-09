// packages/modern-cmdk/src/core/keyboard/matcher.ts
// KeyboardEvent → Shortcut matcher — conflict detection via mapGroupBy helper

import { mapGroupBy } from '../utils/group-by.js';
import type { ParsedShortcut } from './parser.js';

/** The eleven US punctuation codes and the key each stands for */
const PUNCTUATION: Readonly<Record<string, string>> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** One printable ASCII character (U+0020 to U+007E): a key value that does not depend on the layout */
const ASCII_KEY = /^[ -~]$/;

/**
 * Whether the physical key (`event.code`) stands for the shortcut's key when `event.key` does not: a layout
 * whose key value is not that character (Cyrillic letters, macOS Option glyphs, `Dead`, the shifted symbol of
 * a digit). `Digit0` to `Digit9` and `Space` always map; `KeyA` to `KeyZ` and the punctuation codes map only
 * when `event.key` is not one printable ASCII character, so an AZERTY `a` on `KeyQ` stays an `a`. An AltGr
 * press (AltGraph without `altKey`) never maps.
 */
function matchesCode(event: KeyboardEvent, key: string): boolean {
  const { code } = event;
  if (event.getModifierState('AltGraph') && !event.altKey) return false;
  const digit = /^Digit(\d)$/.exec(code)?.[1];
  if (digit !== undefined || code === 'Space') return (digit ?? 'space') === key;
  if (ASCII_KEY.test(event.key)) return false;
  return (/^Key([A-Z])$/.exec(code)?.[1]?.toLowerCase() ?? PUNCTUATION[code]) === key;
}

/** 2 when the event matches the shortcut through `event.key`, 1 through `event.code` only, else 0 */
function rank(event: KeyboardEvent, shortcut: ParsedShortcut): 0 | 1 | 2 {
  // All four modifier keys compare exactly
  if (
    shortcut.meta !== event.metaKey ||
    shortcut.ctrl !== event.ctrlKey ||
    shortcut.shift !== event.shiftKey ||
    shortcut.alt !== event.altKey
  )
    return 0;
  if (event.key.toLowerCase() === shortcut.key) return 2;
  return matchesCode(event, shortcut.key) ? 1 : 0;
}

/**
 * Tests whether a KeyboardEvent exactly matches a ParsedShortcut: the four modifier keys (meta, ctrl, shift,
 * alt) and the primary key, by `event.key` or, when that misses, by the physical key (`event.code`, for layouts
 * whose key value is not the shortcut's character).
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  return rank(event, shortcut) > 0;
}

/**
 * The first candidate whose shortcut matches the event through `event.key`; failing that, the first that matches
 * through `event.code`. A key match wins over a code match whatever the order.
 */
export function pickMatch<T>(
  event: KeyboardEvent,
  candidates: Iterable<T>,
  shortcutOf: (candidate: T) => ParsedShortcut,
): T | undefined {
  let viaCode: T | undefined;
  for (const candidate of candidates) {
    const r = rank(event, shortcutOf(candidate));
    if (r === 2) return candidate;
    if (r === 1) viaCode ??= candidate;
  }
  return viaCode;
}

/** Match a KeyboardEvent against a list of shortcuts: a `event.key` match first, then a `event.code` match */
export function findMatchingShortcut(
  event: KeyboardEvent,
  shortcuts: readonly ParsedShortcut[],
): ParsedShortcut | null {
  return pickMatch(event, shortcuts, (shortcut) => shortcut) ?? null;
}

/**
 * Detects conflicting shortcut bindings by grouping on their normalized form
 * via mapGroupBy helper. Returns only groups with two or more colliding shortcuts.
 * mapGroupBy returns a Map directly — no Object.entries conversion needed.
 */
export function detectConflicts(
  shortcuts: readonly ParsedShortcut[],
): ReadonlyMap<string, readonly ParsedShortcut[]> {
  const grouped = mapGroupBy(shortcuts, (s) => s.normalized);

  // Iterator Helpers pipeline — filter to only conflicting groups (2+ collisions)
  return new Map(grouped.entries().filter(([, group]) => group.length > 1));
}
