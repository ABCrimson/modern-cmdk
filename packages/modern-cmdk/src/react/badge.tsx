'use client';

// packages/command-react/src/badge.tsx
// <Command.Badge> — renders a category/type badge on items
// React 19: ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';

export interface CommandBadgeProps extends ComponentPropsWithRef<'span'> {}

/** Inline badge for categorization or status indicators on command items. */
export function CommandBadge({ ref, children, ...props }: CommandBadgeProps): ReactNode {
  return (
    <span ref={ref} data-command-badge="" {...props}>
      {children}
    </span>
  );
}
