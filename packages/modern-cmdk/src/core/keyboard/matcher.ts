// packages/command/src/keyboard/matcher.ts
// KeyboardEvent → Shortcut matcher — Map.groupBy (ES2026) for conflict detection

import type { ParsedShortcut } from './parser.js';

/**
 * Tests whether a KeyboardEvent exactly matches a ParsedShortcut,
 * comparing all four modifier keys (meta, ctrl, shift, alt) and the primary key.
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  // Check modifier keys
  if (shortcut.meta !== event.metaKey) return false;
  if (shortcut.ctrl !== event.ctrlKey) return false;
  if (shortcut.shift !== event.shiftKey) return false;
  if (shortcut.alt !== event.altKey) return false;

  // Check the primary key
  const eventKey = event.key.toLowerCase();
  return eventKey === shortcut.key;
}

/** Match a KeyboardEvent against a list of shortcuts — Iterator Helpers .find() */
export function findMatchingShortcut(
  event: KeyboardEvent,
  shortcuts: readonly ParsedShortcut[],
): ParsedShortcut | null {
  return shortcuts.values().find((shortcut) => matchesShortcut(event, shortcut)) ?? null;
}

/**
 * Detects conflicting shortcut bindings by grouping on their normalized form
 * via Map.groupBy (ES2026). Returns only groups with two or more colliding shortcuts.
 * Map.groupBy returns a Map directly — no Object.entries conversion needed.
 */
export function detectConflicts(
  shortcuts: readonly ParsedShortcut[],
): ReadonlyMap<string, readonly ParsedShortcut[]> {
  // Map.groupBy (ES2026) — returns Map<string, ParsedShortcut[]> directly
  const grouped = Map.groupBy(shortcuts, (s) => s.normalized);

  // Iterator Helpers pipeline — filter to only conflicting groups (2+ collisions)
  return new Map(
    grouped.entries().filter(([, group]) => group.length > 1),
  );
}
