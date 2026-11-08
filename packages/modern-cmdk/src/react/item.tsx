// packages/modern-cmdk/src/react/item.tsx
// <Command.Item> — ref as prop (no forwardRef), useId for ARIA
// React 19: use() for context
// Isolated declarations: explicit return types on all exports

import type {
  ComponentPropsWithRef,
  CSSProperties,
  MouseEvent,
  PointerEvent,
  ReactNode,
} from 'react';
import { use, useCallback, useLayoutEffect, useRef } from 'react';
import { CommandGroupContext, useStableContext, useStateContext } from './context.js';
import { useRegisterItem } from './hooks/use-register.js';

export interface CommandItemProps extends Omit<ComponentPropsWithRef<'div'>, 'onSelect' | 'value'> {
  readonly value: string;
  readonly keywords?: readonly string[];
  /** Called when the item is selected by click, Enter or shortcut (no argument in 1.x; the value arrives in 2.0) */
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
  readonly shortcut?: string;
  /** The registration id and the DOM id; defaults to a `useId` id. Wins over the deprecated `forceId`. */
  readonly id?: string | undefined;
  /** @deprecated Use `id`. Removed in 2.0. */
  readonly forceId?: string;
  /**
   * How the props you pass meet the item's own handlers and style. The default `'override'` spreads your props last, so
   * an `onClick`, `onPointerMove` or `style` of yours replaces the item's. `'compose'` spreads them first: your
   * `onClick` and `onPointerMove` run, then the item selects or activates unless the event is default-prevented, your
   * `style` merges under the virtual position, and the `id`, `role` and `aria-*` attributes the item manages win.
   * The default becomes `'compose'` in 2.0.
   */
  readonly propsMerge?: 'override' | 'compose' | undefined;
}

/** Individual selectable item in the command list with keyboard and pointer activation. */
export function CommandItem({
  ref,
  children,
  value,
  keywords,
  onSelect,
  disabled = false,
  shortcut,
  id: idProp,
  forceId,
  propsMerge = 'override',
  ...props
}: CommandItemProps): ReactNode {
  const stable = useStableContext('Command.Item');
  const stateCtx = useStateContext('Command.Item');

  // Read group context — items inside a <Command.Group> auto-inherit groupId
  const groupCtx = use(CommandGroupContext);

  const id = useRegisterItem(value, {
    ...(keywords !== undefined && { keywords }),
    ...(shortcut !== undefined && { shortcut }),
    disabled,
    ...(onSelect !== undefined && { onSelect }),
    ...(idProp !== undefined && { id: idProp }),
    ...(forceId !== undefined && { forceId }),
    ...(groupCtx !== null && { groupId: groupCtx.groupId }),
  });

  const isActive: boolean = stateCtx.state.activeId === id;
  // O(1) Set.has instead of O(n) Array.includes — critical for large lists
  // An item the registry does not hold yet (the server, the hydration pass, a first render: items register in layout
  // effects) renders under an empty query; once registered, only the filtered items render
  const isFiltered: boolean =
    stateCtx.filteredIdSet.has(id) ||
    (stateCtx.state.search === '' && stable.machine.getRegistry().getItem(id) === undefined);
  // Virtual visibility — null means not virtualizing, so all filtered items are visible
  const isVisible: boolean = stateCtx.visibleIdSet === null || stateCtx.visibleIdSet.has(id);

  const handleSelect = useCallback((): void => {
    if (!disabled) {
      stable.machine.send({ type: 'ITEM_SELECT', id });
    }
  }, [stable.machine, id, disabled]);

  // Use ref for activeId to avoid re-creating callback on every active change; the layout effect commits the
  // value before any pointer event can read it
  const activeIdRef = useRef(stateCtx.state.activeId);
  useLayoutEffect(() => {
    activeIdRef.current = stateCtx.state.activeId;
  }, [stateCtx.state.activeId]);

  const handlePointerMove = useCallback((): void => {
    if (!disabled && activeIdRef.current !== id) {
      stable.machine.send({ type: 'ITEM_ACTIVATE', id });
    }
  }, [stable.machine, id, disabled]);

  // Items must still register (useRegisterItem above) but don't render DOM if filtered out or off-screen
  if (!isFiltered || !isVisible) return null;

  // Virtual positioning — absolute + the `translate` property when virtualizing
  const virtualStart = stateCtx.virtualPositionMap?.get(id);
  const virtualStyle: CSSProperties | undefined =
    virtualStart !== undefined
      ? { position: 'absolute', top: 0, left: 0, width: '100%', translate: `0 ${virtualStart}px` }
      : undefined;

  const composing: boolean = propsMerge === 'compose';

  return (
    <div
      {...(composing ? props : undefined)}
      ref={ref}
      data-command-item=""
      data-active={isActive ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-value={value}
      id={id}
      role="option"
      aria-selected={isActive}
      aria-disabled={disabled || undefined}
      aria-keyshortcuts={shortcut ?? undefined}
      onClick={
        composing
          ? (event: MouseEvent<HTMLDivElement>): void => {
              props.onClick?.(event);
              if (!event.defaultPrevented) handleSelect();
            }
          : handleSelect
      }
      onPointerMove={
        composing
          ? (event: PointerEvent<HTMLDivElement>): void => {
              props.onPointerMove?.(event);
              if (!event.defaultPrevented) handlePointerMove();
            }
          : handlePointerMove
      }
      style={composing ? { ...props.style, ...virtualStyle } : virtualStyle}
      {...(composing ? undefined : props)}
    >
      {children}
    </div>
  );
}
