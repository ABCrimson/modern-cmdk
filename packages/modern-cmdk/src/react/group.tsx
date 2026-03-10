'use client';

// packages/command-react/src/group.tsx
// <Command.Group> — role="group" + aria-labelledby with useId() heading ID
// React 19: use() for context, ref as prop
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use, useId, useMemo } from 'react';
import type { CommandGroupContextValue } from './context.js';
import { CommandGroupContext, CommandStateContext } from './context.js';
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
  const stateCtx = use(CommandStateContext);
  if (!stateCtx) {
    throw new Error('Command.Group must be used within a <Command> component');
  }

  const headingId: string = useId();
  const groupId = useRegisterGroup(heading, {
    ...(priority !== undefined && { priority }),
    ...(forceId !== undefined && { forceId }),
  });

  // Check if any items in this group are visible
  const groupItems = stateCtx.state.groupedIds.get(groupId);
  const hasVisibleItems: boolean = groupItems !== undefined && groupItems.length > 0;

  const groupContext = useMemo<CommandGroupContextValue>(
    () => ({ groupId: groupId as string, headingId }) satisfies CommandGroupContextValue,
    [groupId, headingId],
  );

  // Always render children so items can register via useLayoutEffect.
  // Hide the group visually when no items match — but keep children mounted.
  if (!hasVisibleItems) {
    return (
      <CommandGroupContext value={groupContext}>
        <div style={{ display: 'none' }}>{children}</div>
      </CommandGroupContext>
    );
  }

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
