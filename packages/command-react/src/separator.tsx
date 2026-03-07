'use client';

// packages/command-react/src/separator.tsx
// <Command.Separator> — role="separator"

import type { ComponentPropsWithRef, ReactNode } from 'react';

export interface CommandSeparatorProps extends ComponentPropsWithRef<'div'> {}

export function CommandSeparator({ ref, ...props }: CommandSeparatorProps): ReactNode {
  return <div ref={ref} data-command-separator="" role="separator" {...props} />;
}
