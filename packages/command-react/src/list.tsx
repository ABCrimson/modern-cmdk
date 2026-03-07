'use client';

// packages/command-react/src/list.tsx
// <Command.List> — auto-virtualization when filteredCount > 100, ResizeObserver for height
// GPU-composited scroll container, aria-live announcements, scroll-to-active on keyboard nav

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { CommandContext } from './context.js';
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
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('Command.List must be used within a <Command> component');
  }

  const innerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(0);

  // Auto-virtualize when filteredCount > 100 (cmdk threshold)
  const shouldVirtualize = virtualize ?? ctx.state.filteredCount > 100;

  // ResizeObserver for --command-list-height CSS custom property
  useEffect(() => {
    const element = innerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      // Single observed element — take the last entry's height
      const lastEntry = entries.at(-1);
      if (lastEntry) setHeight(lastEntry.contentRect.height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Virtualizer — only active when shouldVirtualize is true
  const virtualizer = useVirtualizer({
    count: ctx.state.filteredCount,
    estimateSize,
    overscan,
    scrollElement: shouldVirtualize ? scrollRef.current : null,
    enabled: shouldVirtualize,
  });

  // Scroll-to-active on keyboard navigation
  const prevActiveId = useRef(ctx.state.activeId);
  useEffect(() => {
    if (ctx.state.activeId && ctx.state.activeId !== prevActiveId.current) {
      prevActiveId.current = ctx.state.activeId;

      if (shouldVirtualize) {
        // Virtual mode: use virtualizer scrollToIndex
        const idx = ctx.state.filteredIds.indexOf(ctx.state.activeId);
        if (idx >= 0) virtualizer.scrollToIndex(idx);
      } else {
        // DOM mode: scrollIntoView on the active element
        const el = scrollRef.current?.querySelector(`[id="${CSS.escape(ctx.state.activeId)}"]`);
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [ctx.state.activeId, ctx.state.filteredIds, shouldVirtualize, virtualizer]);

  const mergedStyle = {
    ...style,
    '--command-list-height': `${height.toFixed(1)}px`,
    // will-change: height is set in styles.css — no need to duplicate inline
  } as React.CSSProperties;

  // Ref merge callback
  const setScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      (scrollRef as React.RefObject<HTMLDivElement | null>).current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = el;
    },
    [ref],
  );

  return (
    <div
      ref={setScrollRef}
      data-command-list=""
      role="listbox"
      aria-label={ctx.label}
      aria-busy={ctx.state.loading}
      id={ctx.listId}
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
        {ctx.state.filteredCount} result{ctx.state.filteredCount !== 1 ? 's' : ''} available.
      </div>
    </div>
  );
}
