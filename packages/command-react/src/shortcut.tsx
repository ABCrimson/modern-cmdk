'use client';

// packages/command-react/src/shortcut.tsx
// <Command.Shortcut> — renders platform-appropriate key labels

import { formatShortcut, parseShortcut } from '@crimson_dev/command';
import type { ComponentPropsWithRef, ReactNode } from 'react';

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
  // If a shortcut string is provided, parse and format it
  const displayText = shortcut ? formatShortcut(parseShortcut(shortcut)) : children;

  return (
    <kbd ref={ref} data-command-shortcut="" {...props}>
      {displayText}
    </kbd>
  );
}
