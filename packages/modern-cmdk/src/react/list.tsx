'use client';

// packages/command-react/src/list.tsx
// <Command.List> — auto-virtualization when filteredCount > 100, ResizeObserver for height
// GPU-composited scroll container, aria-live announcements, scroll-to-active on keyboard nav
// React 19: use() for context, ref as prop (no forwardRef)
// ES2026: Iterator Helpers for virtual item mapping
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, CSSProperties, ReactNode, RefObject } from 'react';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { CommandStableContext, CommandStateContext } from './context.js';
import { useVirtualizer } from './hooks/use-virtualizer.js';

export interface CommandListProps extends ComponentPropsWithRef<'div'> {
  /** Override automatic virtualization (default: auto at >100 items, false to opt-out) */
  readonly virtualize?: boolean;
  /** Estimated item height for virtualization (default: 44px) */
  readonly estimateSize?: number;
  /** Overscan count for virtualization (default: 8) */
  readonly overscan?: number;
}

export function CommandList({
  ref,
  children,
  virtualize,
  estimateSize = 44,
  overscan = 8,
  style,
  ...props
}: CommandListProps): ReactNode {
  const stable = use(CommandStableContext);
  if (!stable) {
    throw new Error('Command.List must be used within a <Command> component');
  }
  const stateCtx = use(CommandStateContext);
  if (!stateCtx) {
    throw new Error('Command.List must be used within a <Command> component');
  }

  const innerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(0);

  // Auto-virtualize when filteredCount > 100 (cmdk threshold)
  const shouldVirtualize: boolean = virtualize ?? stateCtx.state.filteredCount > 100;

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
    scrollElement: shouldVirtualize ? scrollRef.current : null,
    enabled: shouldVirtualize,
  });

  // Scroll-to-active on keyboard navigation
  const prevActiveId = useRef<string | null>(stateCtx.state.activeId);
  useEffect(() => {
    if (stateCtx.state.activeId && stateCtx.state.activeId !== prevActiveId.current) {
      prevActiveId.current = stateCtx.state.activeId;

      if (shouldVirtualize) {
        // Virtual mode: use virtualizer scrollToIndex
        const idx = stateCtx.state.filteredIds.indexOf(stateCtx.state.activeId);
        if (idx >= 0) virtualizer.scrollToIndex(idx);
      } else {
        // DOM mode: scrollIntoView on the active element
        const el = scrollRef.current?.querySelector(
          `[id="${CSS.escape(stateCtx.state.activeId)}"]`,
        );
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [stateCtx.state.activeId, stateCtx.state.filteredIds, shouldVirtualize, virtualizer]);

  const mergedStyle: CSSProperties & Record<`--${string}`, string> = {
    ...style,
    '--command-list-height': `${height.toFixed(1)}px`,
  };

  // Ref merge callback — combines internal scrollRef with external ref prop
  const setScrollRef = useCallback(
    (el: HTMLDivElement | null): void => {
      (scrollRef as RefObject<HTMLDivElement | null>).current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as RefObject<HTMLDivElement | null>).current = el;
    },
    [ref],
  );

  return (
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
        // Virtualized rendering — GPU-composited translateY positioning
        <div
          data-command-list-virtual=""
          style={{ height: `${virtualizer.totalSize}px`, position: 'relative' }}
        >
          {virtualizer.virtualItems.map((vItem) => (
            <div
              key={vItem.key}
              data-command-virtual-item=""
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                translate: `0 ${vItem.start}px`,
              }}
            />
          ))}
          {/* Children still render for React reconciliation */}
          {children}
        </div>
      ) : (
        <div ref={innerRef} data-command-list-inner="">
          {children}
        </div>
      )}
      {/* aria-live region for screen reader announcements */}
      <div
        aria-live="polite"
        aria-atomic
        role="status"
        data-command-aria-live=""
        className="sr-only"
      >
        {stateCtx.state.filteredCount} result{stateCtx.state.filteredCount !== 1 ? 's' : ''}{' '}
        available.
      </div>
    </div>
  );
}
