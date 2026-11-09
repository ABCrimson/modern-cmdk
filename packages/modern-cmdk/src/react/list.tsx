// packages/modern-cmdk/src/react/list.tsx
// <Command.List> — auto-virtualization when filteredCount > 100, ResizeObserver for height
// Scroll container with a named scroll-timeline, aria-live announcements, scroll-to-active on keyboard nav
// A layout effect puts the DOM in the display order (getDisplayIds) in both list modes
// React 19: use() for context, ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import type { ItemId } from 'modern-cmdk';
import { getDisplayIds } from 'modern-cmdk';
import type {
  ComponentPropsWithRef,
  CSSProperties,
  ReactNode,
  RefCallback,
  RefObject,
} from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CommandListStatusContext,
  CommandStateContext,
  type CommandStateContextValue,
  useStableContext,
  useStateContext,
} from './context.js';
import { useHydrated } from './hooks/use-hydrated.js';
import { useVirtualizer } from './hooks/use-virtualizer.js';

export interface CommandListProps extends ComponentPropsWithRef<'div'> {
  /** Override automatic virtualization (default: auto at >100 items, false to opt-out) */
  readonly virtualize?: boolean | undefined;
  /** Estimated item height for virtualization (default: 44px) */
  readonly estimateSize?: number | undefined;
  /** Overscan count for virtualization (default: 8) */
  readonly overscan?: number | undefined;
  /** Custom aria-live announcement formatter for i18n (receives filtered count, returns announcement text) */
  readonly announceResults?: ((count: number) => string) | undefined;
}

// Each child's index in the JSX order, renewed on each run; a child React moves by a keyed
// reorder keeps its earlier index until it remounts (D145 Risks)
const jsxKey = new WeakMap<ChildNode, number>();

/** Scrollable list container with auto-virtualization and aria-live announcements. */
export function CommandList({
  ref,
  children,
  virtualize,
  estimateSize = 44,
  overscan = 8,
  announceResults,
  style,
  ...props
}: CommandListProps): ReactNode {
  const stable = useStableContext('Command.List');
  const stateCtx = useStateContext('Command.List');
  // The live-region text waits for hydration: until then the registry lacks the items that register
  // in effects
  const hydrated: boolean = useHydrated();

  const innerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // State-tracked scroll element — triggers re-render when ref callback fires,
  // so the virtualizer receives the actual DOM element instead of null
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<number>(0);

  // Latch: virtualization turns on above 100 matches and stays on until the count drops to 50 or fewer, so a
  // count hovering around the threshold does not flip the mode on every keystroke. The latch is state derived
  // from its previous value while rendering (the "adjusting state while rendering" pattern of react.dev), so
  // render writes no ref: React re-renders this component at once with the new value, before any child runs.
  const filteredCount = stateCtx.state.filteredCount;
  const [latched, setLatched] = useState<boolean>(false);
  const nextLatched: boolean = filteredCount > 100 || (latched && filteredCount > 50);
  if (nextLatched !== latched) setLatched(nextLatched);
  const shouldVirtualize: boolean = virtualize ?? nextLatched;

  // The display order: the items of `groupedIds` in key order, the order the keyboard walks, the
  // virtual rows take their places in and the effect below gives the DOM
  const groupedIds = stateCtx.state.groupedIds;
  const displayIds = useMemo(() => getDisplayIds({ groupedIds }), [groupedIds]);

  // ResizeObserver for the --command-list-height CSS custom property. The one inner element is always
  // mounted, so the observer never watches a detached node. It reports the inner element's content height
  // while the list is not virtual. While the inner element is virtual its height is the sum of all the row
  // sizes, which would defeat a consumer's `height: var(--command-list-height)`, so the observer ignores
  // that entry and the property holds its last non-virtual value (0px when the list mounts virtual).
  useEffect(() => {
    const element = innerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
      // Single observed element — take the last entry's height
      const lastEntry = entries.at(-1);
      if (lastEntry && !lastEntry.target.hasAttribute('data-command-list-virtual')) {
        setHeight(lastEntry.contentRect.height);
      }
    });

    observer.observe(element);
    return (): void => {
      observer.disconnect();
    };
  }, []);

  // Virtualizer — only active when shouldVirtualize is true
  const virtualizer = useVirtualizer({
    count: stateCtx.state.filteredCount,
    estimateSize,
    overscan,
    scrollElement: shouldVirtualize ? scrollElement : null,
    enabled: shouldVirtualize,
  });

  // Scroll-to-active, just into view ('nearest'): virtual mode scrolls by index (a row the virtualizer does not
  // render cannot be hovered), DOM mode with scrollIntoView. A hovered active row is not scrolled: a pointer
  // activates the row it is over, which is in view, and a keyboard step onto the hovered row does not scroll it
  // either, so a hovered row partly outside the view stays as it is.
  const prevActiveId = useRef<string | null>(stateCtx.state.activeId);
  useEffect(() => {
    const activeId = stateCtx.state.activeId;
    if (activeId && activeId !== prevActiveId.current) {
      prevActiveId.current = activeId;
      const el = scrollRef.current?.querySelector(`[id="${CSS.escape(activeId)}"]`);
      if (el?.matches(':hover')) return;

      if (shouldVirtualize) {
        // Virtual mode: the row sits at the item's place in the display order
        const idx = displayIds.indexOf(activeId as ItemId);
        if (idx >= 0) virtualizer.scrollToIndex(idx, 'nearest');
      } else {
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [stateCtx.state.activeId, shouldVirtualize, virtualizer, displayIds]);

  const mergedStyle = useMemo<CSSProperties & Record<`--${string}`, string>>(
    () => ({ ...style, '--command-list-height': `${height.toFixed(1)}px` }),
    [style, height],
  );

  // Compute visible IDs and position map from virtualizer output: row `index` is a place in the
  // display order
  const { visibleIdSet, virtualPositionMap } = useMemo(() => {
    if (!shouldVirtualize) return { visibleIdSet: null, virtualPositionMap: null };
    const idSet = new Set<ItemId>();
    const posMap = new Map<ItemId, number>();
    for (const vItem of virtualizer.virtualItems) {
      const id = displayIds[vItem.index];
      if (id !== undefined) {
        idSet.add(id);
        posMap.set(id, vItem.start);
      }
    }
    return {
      visibleIdSet: idSet as ReadonlySet<ItemId>,
      virtualPositionMap: posMap as ReadonlyMap<ItemId, number>,
    };
  }, [shouldVirtualize, virtualizer.virtualItems, displayIds]);

  // Puts the DOM in the display order in both modes, so the arrow keys, the screen and a screen
  // reader agree. The inner element is taken by ref, since its data attribute changes with the
  // mode. It runs when the order or the virtual window changes: the items and groups React mounted
  // for that change are placed too, and a refilter that keeps the order writes nothing.
  // Each container (the inner element, every group's items, every page) is ordered alone. A rank is
  // the display index (an item) or the lowest one among the items inside the child (a group, a
  // wrapper); a page, a separator, a heading and a comment have none. A child without a rank keeps
  // its place in the JSX order and the ranked children fill the other places. A child that appeared
  // since the last run took the place React gave it, directly before its next JSX sibling, so it is
  // keyed just below the first known child after it, or after every child when none follows. Nodes
  // move inside their parent only, and only when the order differs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the virtual window re-runs the order
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const order = new Map(displayIds.map((id, at) => [id as string, at]));
    for (const container of [
      inner,
      ...inner.querySelectorAll('[data-command-group-items], [data-command-page]'),
    ]) {
      const slots = [...container.childNodes].map(
        (node): [number | undefined, number, ChildNode] => {
          let rank = Infinity;
          if (node.nodeType === 1 && !(node as Element).hasAttribute('data-command-page'))
            for (const el of [
              node as Element,
              ...(node as Element).querySelectorAll('[data-command-item]'),
            ])
              rank = Math.min(rank, order.get(el.id) ?? Infinity);
          return [jsxKey.get(node), rank, node];
        },
      );
      let next = Infinity;
      for (let i = slots.length; i--; ) {
        const slot = slots[i] as [number | undefined, number, ChildNode];
        if (slot[0] === undefined) slot[0] = next - 0.5;
        else next = slot[0];
      }
      slots.sort((a, b) => (a[0] as number) - (b[0] as number));
      const units = slots.toSorted((a, b) => a[1] - b[1]);
      let unit = 0;
      let cursor = container.firstChild;
      slots.forEach(([, rank, slot], at) => {
        jsxKey.set(slot, at);
        const node = rank < Infinity ? (units[unit++]?.[2] as ChildNode) : slot;
        if (node === cursor || node.nodeType !== 1) cursor = node.nextSibling;
        else container['moveBefore' in container ? 'moveBefore' : 'insertBefore'](node, cursor);
      });
    }
  }, [displayIds, visibleIdSet]);

  // Override state context for children — adds visibleIdSet and virtualPositionMap
  const virtualizedStateCtx = useMemo<CommandStateContextValue>(
    () => ({
      ...stateCtx,
      visibleIdSet,
      virtualPositionMap,
    }),
    [stateCtx, visibleIdSet, virtualPositionMap],
  );

  // Ref callback that merges the internal scroll ref, the scroll-element state and the consumer's `ref`
  // prop. It returns a cleanup (a React 19 ref cleanup), so React never calls it with null: the cleanup
  // undoes what the callback set. A new `ref` identity (an inline callback) detaches the old callback and
  // attaches a new one, which hands the element to the new ref; the scroll-element state ends the commit
  // at the same element, so the re-render that follows bails out and the cycle ends there.
  const setScrollRef = useCallback(
    (el: HTMLDivElement | null): (() => void) => {
      (scrollRef as RefObject<HTMLDivElement | null>).current = el;
      setScrollElement(el);
      let refCleanup: ReturnType<RefCallback<HTMLDivElement>>;
      if (typeof ref === 'function') refCleanup = ref(el);
      else if (ref) ref.current = el;
      return (): void => {
        (scrollRef as RefObject<HTMLDivElement | null>).current = null;
        setScrollElement(null);
        // A ref callback that returned a cleanup gets no null call, as in React
        if (typeof refCleanup === 'function') refCleanup();
        else if (typeof ref === 'function') ref(null);
        else if (ref) ref.current = null;
      };
    },
    [ref],
  );

  const statusContainerRef = useRef<HTMLDivElement>(null);

  return (
    <CommandListStatusContext value={statusContainerRef}>
      <div
        ref={setScrollRef}
        data-command-list=""
        role="listbox"
        aria-label={stable.label}
        aria-busy={stateCtx.state.loading}
        id={stable.listId}
        style={mergedStyle}
        {...props}
      >
        {/* One element tree in both modes: the mode changes this element's props only, so the items stay mounted when the match count crosses the threshold. */}
        <div
          ref={innerRef}
          data-command-list-inner={shouldVirtualize ? undefined : ''}
          data-command-list-virtual={shouldVirtualize ? '' : undefined}
          style={
            shouldVirtualize
              ? { height: `${virtualizer.totalSize}px`, position: 'relative' }
              : undefined
          }
        >
          <CommandStateContext value={virtualizedStateCtx}>{children}</CommandStateContext>
        </div>
      </div>
      {/* Status container for Command.Empty — rendered outside the listbox for ARIA compliance */}
      <div ref={statusContainerRef} data-command-list-status="" />
      {/* aria-live region for screen reader announcements — outside listbox for valid ARIA */}
      <div
        aria-live="polite"
        aria-atomic
        role="status"
        data-command-aria-live=""
        className="sr-only"
      >
        {hydrated
          ? announceResults
            ? announceResults(stateCtx.state.filteredCount)
            : `${stateCtx.state.filteredCount} result${stateCtx.state.filteredCount !== 1 ? 's' : ''} available.`
          : ''}
      </div>
    </CommandListStatusContext>
  );
}
