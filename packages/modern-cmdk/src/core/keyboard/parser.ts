// packages/modern-cmdk/src/core/keyboard/parser.ts
// Shortcut string parser ("Mod+K")

import { ensureWellFormed } from '../utils/string-wellformed.js';

/**
 * Structured representation of a keyboard shortcut after parsing.
 * The `normalized` field provides a deterministic string for dedup and comparison.
 */
export interface ParsedShortcut {
  readonly key: string;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly raw: string;
  readonly normalized: string;
}

/** Platform detection regex — matches Apple device platform strings */
const MAC_PLATFORM_RE: RegExp = /Mac|iPod|iPhone|iPad/;

/** Platform a shortcut is resolved and displayed for: Apple devices or everything else. */
export type ShortcutPlatform = 'mac' | 'other';

/**
 * Reads the platform from `navigator` at call time: `'mac'` when `navigator.userAgentData.platform` is
 * `'macOS'` or `navigator.platform` names an Apple device, else `'other'` (also without `navigator`).
 */
function detectPlatform(): ShortcutPlatform {
  return typeof navigator !== 'undefined' &&
    ((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS' ||
      MAC_PLATFORM_RE.test(navigator.platform))
    ? 'mac'
    : 'other';
}

/** Modifier aliases; `mod` is resolved per platform in `parseShortcut` */
const MODIFIER_MAP: Readonly<
  Record<string, keyof Pick<ParsedShortcut, 'meta' | 'ctrl' | 'shift' | 'alt'>>
> = {
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
};

/**
 * Parse a shortcut string like "Mod+Shift+K" into a structured ParsedShortcut.
 * Ensures valid Unicode input via ensureWellFormed helper.
 *
 * `Mod` resolves to Meta on `'mac'` and to Ctrl on `'other'`. Without `platform`, the platform is
 * detected from `navigator` when the function is called.
 */
export function parseShortcut(shortcut: string, platform?: ShortcutPlatform): ParsedShortcut {
  // Ensure valid Unicode before processing
  const safeShortcut = ensureWellFormed(shortcut);

  const parts = safeShortcut.split('+').map((p) => p.trim().toLowerCase());

  let meta = false;
  let ctrl = false;
  let shift = false;
  let alt = false;
  let key = '';

  for (const part of parts) {
    const modifier =
      part === 'mod'
        ? (platform ?? detectPlatform()) === 'mac'
          ? 'meta'
          : 'ctrl'
        : MODIFIER_MAP[part];
    if (modifier) {
      switch (modifier) {
        case 'meta':
          meta = true;
          break;
        case 'ctrl':
          ctrl = true;
          break;
        case 'shift':
          shift = true;
          break;
        case 'alt':
          alt = true;
          break;
      }
    } else {
      key = part;
    }
  }

  // Build normalized string — deterministic modifier order for dedup/comparison
  const modifiers: string[] = [];
  if (meta) modifiers.push('meta');
  if (ctrl) modifiers.push('ctrl');
  if (shift) modifiers.push('shift');
  if (alt) modifiers.push('alt');
  modifiers.push(key);

  return {
    key,
    meta,
    ctrl,
    shift,
    alt,
    raw: safeShortcut,
    normalized: modifiers.join('+'),
  };
}

/**
 * Formats a ParsedShortcut for display using platform-appropriate symbols.
 * On `'mac'`: renders glyphs (⌘, ⇧, ⌥, ⌃). On `'other'`: text labels joined by "+".
 * Without `platform`, the platform is detected from `navigator` when the function is called;
 * pass `'other'` to render the same text on a server and in the hydration pass.
 */
export function formatShortcut(parsed: ParsedShortcut, platform?: ShortcutPlatform): string {
  const isMac = (platform ?? detectPlatform()) === 'mac';
  const parts: string[] = [];

  if (parsed.meta) parts.push(isMac ? '\u2318' : 'Ctrl');
  if (parsed.ctrl && !(!isMac && parsed.meta)) parts.push(isMac ? '\u2303' : 'Ctrl');
  if (parsed.shift) parts.push(isMac ? '\u21E7' : 'Shift');
  if (parsed.alt) parts.push(isMac ? '\u2325' : 'Alt');

  // Capitalize key for display
  const displayKey =
    parsed.key.length === 1
      ? parsed.key.toUpperCase()
      : parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1);

  parts.push(displayKey);

  return isMac ? parts.join('') : parts.join('+');
}
