'use client';

// packages/command-react/src/shortcut.tsx
// <Command.Shortcut> — renders platform-appropriate key labels
// React 19: ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useMemo } from 'react';
import { formatShortcut, parseShortcut } from '../core/index.js';

export interface CommandShortcutProps extends ComponentPropsWithRef<'kbd'> {
  /** Shortcut string to display (e.g., "Mod+K"). If not provided, reads from nearest Command.Item. */
  readonly shortcut?: string;
}

/** Keyboard shortcut display with platform-aware formatting (e.g., Cmd vs Ctrl). */
export function CommandShortcut({
  ref,
  shortcut,
  children,
  ...props
}: CommandShortcutProps): ReactNode {
  // Memoize the parsed + formatted shortcut — only depends on shortcut string, not children
  const formattedShortcut: string | null = useMemo(
    () => (shortcut ? formatShortcut(parseShortcut(shortcut)) : null),
    [shortcut],
  );

  return (
    <kbd ref={ref} data-command-shortcut="" {...props}>
      {formattedShortcut ?? children}
    </kbd>
  );
}
