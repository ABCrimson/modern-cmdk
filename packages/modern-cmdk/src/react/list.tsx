'use client';

// packages/command-react/src/list.tsx
// <Command.List> — auto-virtualization when filteredCount > 100, ResizeObserver for height
// GPU-composited scroll container, aria-live announcements, scroll-to-active on keyboard nav
// React 19: use() for context, ref as prop (no forwardRef)
// ES2026: Iterator Helpers for virtual item mapping
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, CSSProperties, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ItemId } from '../core/index.js';
import {
  CommandListStatusContext,
  CommandStateContext,
  type CommandStateContextValue,
  useStableContext,
  useStateContext,
} from './context.js';
import { useVirtualizer } from './hooks/use-virtualizer.js';

export interface CommandListProps extends ComponentPropsWithRef<'div'> {
  /** Override automatic virtualization (default: auto at >100 items, false to opt-out) */
  readonly virtualize?: boolean;
  /** Estimated item height for virtualization (default: 44px) */
  readonly estimateSize?: number;
  /** Overscan count for virtualization (default: 8) */
  readonly overscan?: number;
  /** Custom aria-live announcement formatter for i18n (receives filtered count, returns announcement text) */
  readonly announceResults?: (count: number) => string;
}

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

  const innerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // State-tracked scroll element — triggers re-render when ref callback fires,
  // so the virtualizer receives the actual DOM element instead of null
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<number>(0);

  // Latch: once virtualization enables, keep it until explicit override or count drops well below threshold
  const shouldVirtualizeRef = useRef<boolean>(false);
  const computedVirtualize: boolean = virtualize ?? stateCtx.state.filteredCount > 100;
  if (computedVirtualize) shouldVirtualizeRef.current = true;
  else if (stateCtx.state.filteredCount <= 50) shouldVirtualizeRef.current = false;
  const shouldVirtualize: boolean = virtualize ?? shouldVirtualizeRef.current;

  // ResizeObserver for --command-list-height CSS custom property
  useEffect(() => {
    const element = innerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
      // Single observed element — take the last entry's height
      const lastEntry = entries.at(-1);
      if (lastEntry) setHeight(lastEntry.contentRect.height);
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

  // Scroll-to-active on keyboard navigation
  const prevActiveId = useRef<string | null>(stateCtx.state.activeId);
  useEffect(() => {
    if (stateCtx.state.activeId && stateCtx.state.activeId !== prevActiveId.current) {
      prevActiveId.current = stateCtx.state.activeId;

      if (shouldVirtualize) {
        // Virtual mode: O(1) index lookup via machine's filteredIdIndex Map
        const idx = stable.machine.getFilteredIdIndex().get(stateCtx.state.activeId) ?? -1;
        if (idx >= 0) virtualizer.scrollToIndex(idx);
      } else {
        // DOM mode: scrollIntoView on the active element
        const el = scrollRef.current?.querySelector(
          `[id="${CSS.escape(stateCtx.state.activeId)}"]`,
        );
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [stateCtx.state.activeId, shouldVirtualize, virtualizer, stable.machine.getFilteredIdIndex]);

  const mergedStyle = useMemo<CSSProperties & Record<`--${string}`, string>>(
    () => ({ ...style, '--command-list-height': `${height.toFixed(1)}px` }),
    [style, height],
  );

  // Compute visible IDs and position map from virtualizer output
  const filteredIds = stateCtx.state.filteredIds;
  const { visibleIdSet, virtualPositionMap } = useMemo(() => {
    if (!shouldVirtualize) return { visibleIdSet: null, virtualPositionMap: null };
    const idSet = new Set<ItemId>();
    const posMap = new Map<ItemId, number>();
    for (const vItem of virtualizer.virtualItems) {
      const id = filteredIds[vItem.index];
      if (id !== undefined) {
        idSet.add(id);
        posMap.set(id, vItem.start);
      }
    }
    return {
      visibleIdSet: idSet as ReadonlySet<ItemId>,
      virtualPositionMap: posMap as ReadonlyMap<ItemId, number>,
    };
  }, [shouldVirtualize, virtualizer.virtualItems, filteredIds]);

  // Override state context for children — adds visibleIdSet and virtualPositionMap
  const virtualizedStateCtx = useMemo<CommandStateContextValue>(
    () => ({
      ...stateCtx,
      visibleIdSet,
      virtualPositionMap,
    }),
    [stateCtx, visibleIdSet, virtualPositionMap],
  );

  // Stabilize external ref via useRef — prevents ref callback recreation when caller passes inline ref
  const externalRefRef = useRef(ref);
  externalRefRef.current = ref;

  // Ref merge callback — combines internal scrollRef with external ref prop (stable forever)
  // Also updates scrollElement state to trigger re-render so virtualizer gets the DOM element
  const setScrollRef = useCallback((el: HTMLDivElement | null): void => {
    (scrollRef as RefObject<HTMLDivElement | null>).current = el;
    setScrollElement(el);
    const externalRef = externalRefRef.current;
    if (typeof externalRef === 'function') externalRef(el);
    else if (externalRef) (externalRef as RefObject<HTMLDivElement | null>).current = el;
  }, []);

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
        {shouldVirtualize ? (
          <div
            data-command-list-virtual=""
            style={{ height: `${virtualizer.totalSize}px`, position: 'relative' }}
          >
            <CommandStateContext value={virtualizedStateCtx}>{children}</CommandStateContext>
          </div>
        ) : (
          <div ref={innerRef} data-command-list-inner="">
            {children}
          </div>
        )}
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
        {announceResults
          ? announceResults(stateCtx.state.filteredCount)
          : `${stateCtx.state.filteredCount} result${stateCtx.state.filteredCount !== 1 ? 's' : ''} available.`}
      </div>
    </CommandListStatusContext>
  );
}
