// packages/modern-cmdk/src/react/shortcut.tsx
// <Command.Shortcut> — renders platform-appropriate key labels
// React 19: ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import { formatShortcut, parseShortcut } from 'modern-cmdk';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { subscribeNever } from './hooks/use-hydrated.js';

export interface CommandShortcutProps extends ComponentPropsWithRef<'kbd'> {
  /** Shortcut string to display (e.g., "Mod+K"). Without it the component renders its `children`. */
  readonly shortcut?: string | undefined;
}

/** Keyboard shortcut display with platform-aware formatting (e.g., Cmd vs Ctrl). */
export function CommandShortcut({
  ref,
  shortcut,
  children,
  ...props
}: CommandShortcutProps): ReactNode {
  // The server and the hydration pass render the neutral platform's text; the client then re-renders
  // with the detected platform's, so hydration matches the server HTML on every platform.
  const formattedShortcut: string | null = useSyncExternalStore(
    subscribeNever,
    () => (shortcut ? formatShortcut(parseShortcut(shortcut)) : null),
    () => (shortcut ? formatShortcut(parseShortcut(shortcut, 'other'), 'other') : null),
  );

  return (
    <kbd ref={ref} data-command-shortcut="" {...props}>
      {formattedShortcut ?? children}
    </kbd>
  );
}
