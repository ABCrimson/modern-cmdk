// packages/modern-cmdk/src/react/hooks/use-virtualizer.ts
// Virtualization hook — ResizeObserver + requestIdleCallback for measurement
// Item offsets that item.tsx applies with the `translate` property; content-visibility: auto comes from styles.css ([data-command-item]), not this hook
// Isolated declarations: explicit return types on all exports

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Options of {@link useVirtualizer}: the row count, the row height and the scroll container. */
export interface VirtualizerOptions {
  /** The number of rows */
  readonly count: number;
  /** The height of a row in pixels, used until `measureElement` has measured the row */
  readonly estimateSize: number;
  /**
   * Rows rendered beyond the viewport (default 8). Before it the count is rows: the window starts
   * this many rows before the first row that ends at or after the viewport's top edge. After it
   * the allowance is `overscan * estimateSize` pixels, whatever the rows measure: the window runs
   * on until a row ends beyond the viewport's bottom edge plus that allowance, and that row is
   * its last. Both edges are inclusive: a row that ends exactly at the top edge is kept, and so is
   * a row that starts exactly at the bottom edge plus the allowance.
   */
  readonly overscan?: number | undefined;
  /** The scrolling element whose offset and height the window follows; `null` until it mounts */
  readonly scrollElement: HTMLElement | null;
  /** With `false` the virtualizer is off: no virtual items, a total size of 0, no scrolling or measuring (default: `true`) */
  readonly enabled?: boolean | undefined;
}

/** One row of the virtual window. */
export interface VirtualItem {
  /** The row's index among all rows */
  readonly index: number;
  /** The row's offset from the top of the list, in pixels */
  readonly start: number;
  /** The row's height in pixels: its measured height, else the estimate */
  readonly size: number;
  /** A stable React key for the row */
  readonly key: number;
}

/** What {@link useVirtualizer} returns: the rows in the window and the helpers to place and measure them. */
export interface VirtualizerReturn {
  /** The rows to render: those in or near the viewport */
  readonly virtualItems: readonly VirtualItem[];
  /** The height of all rows together, in pixels */
  readonly totalSize: number;
  /**
   * Scrolls the element to a row. `align` is `'start'` (the default: `scrollTop` becomes the row's offset among the
   * rows, so the row meets the top edge only when nothing precedes the rows, padding included) or `'nearest'`
   * (measured from the element's first child, where the rows must start: a row fully in view does not scroll, a row
   * above meets the top edge, and a row below or partly below meets the bottom edge).
   */
  readonly scrollToIndex: (index: number, align?: 'start' | 'nearest' | undefined) => void;
  /** A ref callback that measures a rendered row from its `data-index` attribute and its height */
  readonly measureElement: (element: HTMLElement | null) => void;
}

/** Lightweight virtualizer for large item lists using ResizeObserver and scroll tracking. */
export function useVirtualizer(options: VirtualizerOptions): VirtualizerReturn {
  const { count, estimateSize, overscan = 8, scrollElement, enabled = true } = options;
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const measuredSizes = useRef<Map<number, number>>(new Map<number, number>());
  const [measureVersion, setMeasureVersion] = useState<number>(0);

  // ResizeObserver + scroll listener — single effect for same element and guards
  useEffect(() => {
    if (!scrollElement || !enabled) return;

    const observer = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
      const lastEntry = entries.at(-1);
      if (lastEntry) setContainerHeight(lastEntry.contentRect.height);
    });
    observer.observe(scrollElement);

    const handleScroll = (): void => {
      setScrollOffset(scrollElement.scrollTop);
    };
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });

    return (): void => {
      observer.disconnect();
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [scrollElement, enabled]);

  // Get item size — O(1) via measured cache or estimate fallback
  const getItemSize = useCallback(
    (index: number): number => measuredSizes.current.get(index) ?? estimateSize,
    [estimateSize],
  );

  // Memoize totalSize — measureVersion triggers recalc when elements are measured
  const totalSize: number = useMemo((): number => {
    void measureVersion; // dependency trigger
    if (!enabled) return 0;
    let total = 0;
    for (let i = 0; i < count; i++) total += getItemSize(i);
    return total;
  }, [enabled, count, getItemSize, measureVersion]);

  // Memoize virtual items computation
  const virtualItems: readonly VirtualItem[] = useMemo((): readonly VirtualItem[] => {
    if (!enabled || containerHeight <= 0) return [];

    // Find the first visible item via linear scan
    let offset = 0;
    let startIdx = 0;
    while (startIdx < count && offset + getItemSize(startIdx) < scrollOffset) {
      offset += getItemSize(startIdx);
      startIdx++;
    }

    // Apply overscan — recalculate offset
    startIdx = Math.max(0, startIdx - overscan);
    offset = 0;
    for (let i = 0; i < startIdx; i++) offset += getItemSize(i);

    // Collect visible items + overscan
    const items: VirtualItem[] = [];
    let currentOffset = offset;
    const endOffset = scrollOffset + containerHeight;

    for (let i = startIdx; i < count; i++) {
      const size = getItemSize(i);
      items.push({
        index: i,
        start: currentOffset,
        size,
        key: i,
      } satisfies VirtualItem);
      currentOffset += size;

      // Stop after overscan past the viewport
      if (currentOffset > endOffset + overscan * estimateSize) break;
    }

    return items;
  }, [enabled, containerHeight, count, scrollOffset, overscan, estimateSize, getItemSize]);

  // Scroll to a specific index — instant for keyboard nav responsiveness. 'start' sets scrollTop to the row's offset
  // among the rows, with no allowance for padding or anything before them; 'nearest' adds that origin (the first
  // child's position), leaves a row fully in view alone and moves any other row just to the viewport's edge.
  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'nearest' | undefined = 'start'): void => {
      if (!scrollElement || !enabled) return;

      const clampedIndex = Math.min(index, count - 1);
      let top = 0;
      for (let i = 0; i < clampedIndex; i++) top += getItemSize(i);

      if (align === 'nearest') {
        // The rows start where the first child starts, after the element's padding and border
        const { scrollTop, clientHeight, clientTop } = scrollElement;
        const viewTop = scrollElement.getBoundingClientRect().top + clientTop;
        top +=
          (scrollElement.firstElementChild?.getBoundingClientRect().top ?? viewTop) -
          viewTop +
          scrollTop;
        const bottomAligned = top + getItemSize(clampedIndex) - clientHeight;
        if (top >= scrollTop) {
          if (bottomAligned <= scrollTop) return;
          top = bottomAligned;
        }
      }

      scrollElement.scrollTo({ top, behavior: 'instant' });
    },
    [scrollElement, enabled, count, getItemSize],
  );

  // Measure an element — deferred via requestIdleCallback, triggers re-render on size change
  const measureElement = useCallback(
    (element: HTMLElement | null): void => {
      if (!element || !enabled) return;

      const index = Number(element.dataset.index);
      if (Number.isNaN(index)) return;

      const measure = (): void => {
        const height = element.getBoundingClientRect().height;
        if (height > 0 && measuredSizes.current.get(index) !== height) {
          measuredSizes.current.set(index, height);
          // Trigger re-render so virtualItems and totalSize recompute with actual sizes
          setMeasureVersion((v) => v + 1);
        }
      };

      if ('requestIdleCallback' in globalThis) {
        requestIdleCallback(measure);
      } else {
        setTimeout(measure, 0);
      }
    },
    [enabled],
  );

  return {
    virtualItems,
    totalSize,
    scrollToIndex,
    measureElement,
  } satisfies VirtualizerReturn;
}
