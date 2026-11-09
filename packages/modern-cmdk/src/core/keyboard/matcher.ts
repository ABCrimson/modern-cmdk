// packages/modern-cmdk/src/core/keyboard/matcher.ts
// KeyboardEvent → Shortcut matcher — conflict detection via mapGroupBy helper

import { mapGroupBy } from '../utils/group-by.js';
import type { ParsedShortcut } from './parser.js';

/** The eleven US punctuation codes; each stands for the character of PUNCTUATION_KEYS at its index */
const PUNCTUATION_CODES =
  'Backquote Minus Equal BracketLeft BracketRight Backslash Semicolon Quote Comma Period Slash'.split(
    ' ',
  );
const PUNCTUATION_KEYS = "`-=[]\\;',./";

/**
 * Whether the physical key (`event.code`) stands for the shortcut's key when `event.key` does not: a layout
 * whose key value is not that character (Cyrillic letters, macOS Option glyphs, `Dead`, the shifted symbol of
 * a digit). `Digit0` to `Digit9` and `Space` always map; `KeyA` to `KeyZ` and the punctuation codes map only
 * when `event.key` is not one printable ASCII character, so an AZERTY `a` on `KeyQ` stays an `a`. An AltGr
 * press (AltGraph without `altKey`) never maps.
 */
function matchesCode(event: KeyboardEvent, key: string): boolean {
  const { code } = event;
  return (
    !(event.getModifierState('AltGraph') && !event.altKey) &&
    (/^(Digit\d|Space)$/.test(code) || !/^[ -~]$/.test(event.key)) &&
    (code === 'Space'
      ? 'space'
      : (/^(?:Key|Digit)(.)$/.exec(code)?.[1]?.toLowerCase() ??
        PUNCTUATION_KEYS[PUNCTUATION_CODES.indexOf(code)])) === key
  );
}

/**
 * Whether `event` matches `shortcut`: the four modifier keys (meta, ctrl, shift, alt) compare exactly, then the
 * primary key by `event.key` or, with `byCode`, by the physical key.
 */
export function matchShortcut(
  event: KeyboardEvent,
  shortcut: ParsedShortcut,
  byCode: boolean,
): boolean {
  return (
    shortcut.meta === event.metaKey &&
    shortcut.ctrl === event.ctrlKey &&
    shortcut.shift === event.shiftKey &&
    shortcut.alt === event.altKey &&
    (byCode ? matchesCode(event, shortcut.key) : event.key.toLowerCase() === shortcut.key)
  );
}

/**
 * Tests whether a KeyboardEvent exactly matches a ParsedShortcut: the four modifier keys and the primary
 * key, by `event.key` or, when that misses, by the physical key (`event.code`, for layouts whose key value
 * is not the shortcut's character).
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  return matchShortcut(event, shortcut, false) || matchShortcut(event, shortcut, true);
}

/** Match a KeyboardEvent against a list of shortcuts: the `event.key` matches first, then the `event.code` ones */
export function findMatchingShortcut(
  event: KeyboardEvent,
  shortcuts: readonly ParsedShortcut[],
): ParsedShortcut | null {
  const find = (byCode: boolean): ParsedShortcut | undefined =>
    shortcuts.values().find((shortcut) => matchShortcut(event, shortcut, byCode));
  return find(false) ?? find(true) ?? null;
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
