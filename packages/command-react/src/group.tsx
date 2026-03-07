'use client';

// packages/command-react/src/group.tsx
// <Command.Group> — role="group" + aria-labelledby with useId() heading ID

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use, useId, useMemo } from 'react';
import { CommandContext, CommandGroupContext } from './context.js';
import { useRegisterGroup } from './hooks/use-register.js';

export interface CommandGroupProps extends ComponentPropsWithRef<'div'> {
  /** Heading text displayed above the group */
  readonly heading?: string;
  /** Sort priority (lower = higher in list) */
  readonly priority?: number;
  /** Force a specific ID */
  readonly forceId?: string;
}

export function CommandGroup({
  ref,
  children,
  heading,
  priority,
  forceId,
  ...props
}: CommandGroupProps): ReactNode {
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('Command.Group must be used within a <Command> component');
  }

  const headingId = useId();
  const groupId = useRegisterGroup(heading, { priority, forceId });

  // Check if any items in this group are visible
  const groupItems = ctx.state.groupedIds.get(groupId);
  const hasVisibleItems = groupItems && groupItems.length > 0;

  const groupContext = useMemo(
    () => ({ groupId: groupId as string, headingId }),
    [groupId, headingId],
  );

  if (!hasVisibleItems) return null;

  return (
    <CommandGroupContext value={groupContext}>
      <div
        ref={ref}
        data-command-group=""
        role="group"
        aria-labelledby={heading ? headingId : undefined}
        {...props}
      >
        {heading && (
          <div data-command-group-heading="" id={headingId} aria-hidden>
            {heading}
          </div>
        )}
        <div data-command-group-items="">{children}</div>
      </div>
    </CommandGroupContext>
  );
}
