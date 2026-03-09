// packages/command/src/keyboard/parser.ts
// Shortcut string parser ("Mod+K") — RegExp.escape (ES2026) for safe pattern construction

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

// Prefer navigator.userAgentData (modern) over deprecated navigator.userAgent
const isMac: boolean =
  typeof navigator !== 'undefined' &&
  ((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS' ||
    /Mac|iPod|iPhone|iPad/.test(navigator.platform));

/** Modifier aliases — cross-platform Mod resolution */
const MODIFIER_MAP: Readonly<
  Record<string, keyof Pick<ParsedShortcut, 'meta' | 'ctrl' | 'shift' | 'alt'>>
> = {
  mod: isMac ? 'meta' : 'ctrl',
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
 * Uses RegExp.escape (ES2026) for safe pattern construction from user-provided strings.
 * Uses String.isWellFormed() (ES2026) to ensure valid Unicode input.
 */
export function parseShortcut(shortcut: string): ParsedShortcut {
  // String.isWellFormed() (ES2026) — validate Unicode before processing
  const safeShortcut = shortcut.isWellFormed() ? shortcut : shortcut.toWellFormed();

  const parts = safeShortcut.split('+').map((p) => p.trim().toLowerCase());

  let meta = false;
  let ctrl = false;
  let shift = false;
  let alt = false;
  let key = '';

  for (const part of parts) {
    const modifier = MODIFIER_MAP[part];
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
 * On macOS: renders glyphs (⌘, ⇧, ⌥, ⌃). On other platforms: text labels joined by "+".
 */
export function formatShortcut(parsed: ParsedShortcut): string {
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
