'use client';

// packages/command-react/src/separator.tsx
// <Command.Separator> — role="none" (presentational inside listbox)
// React 19: ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';

export interface CommandSeparatorProps extends ComponentPropsWithRef<'div'> {}

/** Visual divider between items or groups, rendered as a presentational element. */
export function CommandSeparator({ ref, ...props }: CommandSeparatorProps): ReactNode {
  return <div ref={ref} data-command-separator="" role="none" {...props} />;
}
