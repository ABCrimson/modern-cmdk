'use client';

// packages/command-react/src/badge.tsx
// <Command.Badge> — renders a category/type badge on items

import type { ComponentPropsWithRef, ReactNode } from 'react';

export interface CommandBadgeProps extends ComponentPropsWithRef<'span'> {}

export function CommandBadge({ ref, children, ...props }: CommandBadgeProps): ReactNode {
  return (
    <span ref={ref} data-command-badge="" {...props}>
      {children}
    </span>
  );
}
