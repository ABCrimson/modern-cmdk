'use client';

// packages/command-react/src/shortcut.tsx
// <Command.Shortcut> — renders platform-appropriate key labels
// React 19: ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import { formatShortcut, parseShortcut } from '@crimson_dev/command';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useMemo } from 'react';

export interface CommandShortcutProps extends ComponentPropsWithRef<'kbd'> {
  /** Shortcut string to display (e.g., "Mod+K"). If not provided, reads from nearest Command.Item. */
  readonly shortcut?: string;
}

export function CommandShortcut({
  ref,
  shortcut,
  children,
  ...props
}: CommandShortcutProps): ReactNode {
  // Memoize the parsed + formatted shortcut to avoid re-parsing on every render
  const displayText: ReactNode = useMemo(
    () => (shortcut ? formatShortcut(parseShortcut(shortcut)) : children),
    [shortcut, children],
  );

  return (
    <kbd ref={ref} data-command-shortcut="" {...props}>
      {displayText}
    </kbd>
  );
}
