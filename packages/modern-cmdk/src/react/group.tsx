// packages/modern-cmdk/src/react/group.tsx
// <Command.Group> — role="group" + aria-labelledby with useId() heading ID
// React 19: use() for context, ref as prop
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useId, useMemo } from 'react';
import type { CommandGroupContextValue } from './context.js';
import { CommandGroupContext, useStableContext, useStateContext } from './context.js';
import { useRegisterGroup } from './hooks/use-register.js';

export interface CommandGroupProps extends ComponentPropsWithRef<'div'> {
  /** Heading text displayed above the group */
  readonly heading?: string | undefined;
  /**
   * Orders the keys of `CommandState.groupedIds` (lower first). React renders the groups in the JSX order
   * of the group elements, not by this number.
   */
  readonly priority?: number | undefined;
  /** The registration id, also the id of the group element; the registration id defaults to a `useId` id. Wins over the deprecated `forceId`. */
  readonly id?: string | undefined;
  /** @deprecated Use `id`. Removed in 2.0. */
  readonly forceId?: string | undefined;
}

/** Visual grouping container with an optional heading that hides when no items match. */
export function CommandGroup({
  ref,
  children,
  heading,
  priority,
  id,
  forceId,
  style,
  ...props
}: CommandGroupProps): ReactNode {
  const stateCtx = useStateContext('Command.Group');
  const stable = useStableContext('Command.Group');

  const headingId: string = useId();
  const groupId = useRegisterGroup(heading, { priority, id, forceId });

  // Check if any of this group's own items are visible: a group whose id is the ungrouped bucket's
  // (forceId="__ungrouped") would otherwise count every ungrouped item, including those outside it
  const registry = stable.machine.getRegistry();
  // A group the registry does not hold yet counts as visible under an empty query, so the items of the server HTML are shown
  const hasVisibleItems: boolean =
    (stateCtx.state.groupedIds
      .get(groupId)
      ?.some((id) => registry.getItem(id)?.groupId === groupId) ??
      false) ||
    (stateCtx.state.search === '' && registry.getGroup(groupId) === undefined);

  const groupContext = useMemo<CommandGroupContextValue>(
    () => ({ groupId: groupId as string, headingId }) satisfies CommandGroupContextValue,
    [groupId, headingId],
  );

  // One element tree in both states, so the children keep their identity (no remount, no unregister and register
  // round trip) when the group toggles between no match and match. Items register through layout effects, so the
  // children render even while no item matches; a group without a match is hidden with `display: none`.
  return (
    <CommandGroupContext value={groupContext}>
      <div
        ref={ref}
        data-command-group=""
        id={id}
        role="group"
        aria-labelledby={heading ? headingId : undefined}
        {...props}
        style={hasVisibleItems ? style : { ...style, display: 'none' }}
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
