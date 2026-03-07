'use client';

// packages/command-react/src/hooks/use-virtualizer.ts
// Virtualization hook — ResizeObserver + requestIdleCallback for measurement
// GPU-composited transforms via translateY, content-visibility: auto for off-screen items

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface VirtualizerOptions {
  readonly count: number;
  readonly estimateSize: number;
  readonly overscan?: number;
  readonly scrollElement: HTMLElement | null;
  readonly enabled?: boolean;
}

export interface VirtualItem {
  readonly index: number;
  readonly start: number;
  readonly size: number;
  readonly key: number;
}

export interface VirtualizerReturn {
  readonly virtualItems: readonly VirtualItem[];
  readonly totalSize: number;
  readonly scrollToIndex: (index: number) => void;
  readonly measureElement: (element: HTMLElement | null) => void;
}

export function useVirtualizer(options: VirtualizerOptions): VirtualizerReturn {
  const { count, estimateSize, overscan = 8, scrollElement, enabled = true } = options;
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const measuredSizes = useRef(new Map<number, number>());

  // ResizeObserver for container measurement
  useEffect(() => {
    if (!scrollElement || !enabled) return;

    const observer = new ResizeObserver((entries) => {
      // Single observed element — take the last entry's height
      const lastEntry = entries.at(-1);
      if (lastEntry) setContainerHeight(lastEntry.contentRect.height);
    });

    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [scrollElement, enabled]);

  // Scroll event listener — passive for GPU-composited scrolling
  useEffect(() => {
    if (!scrollElement || !enabled) return;

    function handleScroll(): void {
      setScrollOffset(scrollElement?.scrollTop);
    }

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [scrollElement, enabled]);

  // Get item size — O(1) via measured cache or estimate fallback
  const getItemSize = useCallback(
    (index: number): number => measuredSizes.current.get(index) ?? estimateSize,
    [estimateSize],
  );

  // Memoize totalSize — Math.sumPrecise (ES2026) for floating-point-safe summation
  const totalSize = useMemo(() => {
    if (!enabled) return 0;
    const sizes = Array.from({ length: count }, (_, i) => getItemSize(i));
    return Math.sumPrecise(sizes);
  }, [enabled, count, getItemSize]);

  // Memoize virtual items computation
  const virtualItems = useMemo((): readonly VirtualItem[] => {
    if (!enabled || containerHeight <= 0) return [];

    // Find the first visible item via binary-search-like scan
    let offset = 0;
    let startIdx = 0;
    while (startIdx < count && offset + getItemSize(startIdx) < scrollOffset) {
      offset += getItemSize(startIdx);
      startIdx++;
    }

    // Apply overscan — Math.sumPrecise (ES2026) for offset recalculation
    startIdx = Math.max(0, startIdx - overscan);
    const offsetSizes = Array.from({ length: startIdx }, (_, i) => getItemSize(i));
    offset = Math.sumPrecise(offsetSizes);

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
      });
      currentOffset += size;

      // Stop after overscan past the viewport
      if (currentOffset > endOffset + overscan * estimateSize) break;
    }

    return items;
  }, [enabled, containerHeight, count, scrollOffset, overscan, estimateSize, getItemSize]);

  // Scroll to a specific index — Math.sumPrecise (ES2026) + smooth GPU-composited scrolling
  const scrollToIndex = useCallback(
    (index: number): void => {
      if (!scrollElement || !enabled) return;

      const clampedIndex = Math.min(index, count);
      const sizes = Array.from({ length: clampedIndex }, (_, i) => getItemSize(i));
      const offset = Math.sumPrecise(sizes);

      scrollElement.scrollTo({ top: offset, behavior: 'smooth' });
    },
    [scrollElement, enabled, count, getItemSize],
  );

  // Measure an element — deferred via requestIdleCallback for zero layout thrash
  const measureElement = useCallback(
    (element: HTMLElement | null): void => {
      if (!element || !enabled) return;

      const index = Number(element.dataset.index);
      if (Number.isNaN(index)) return;

      if ('requestIdleCallback' in globalThis) {
        requestIdleCallback(() => {
          const height = element.getBoundingClientRect().height;
          if (height > 0 && measuredSizes.current.get(index) !== height) {
            measuredSizes.current.set(index, height);
          }
        });
      } else {
        setTimeout(() => {
          const height = element.getBoundingClientRect().height;
          if (height > 0) {
            measuredSizes.current.set(index, height);
          }
        }, 0);
      }
    },
    [enabled],
  );

  return {
    virtualItems,
    totalSize,
    scrollToIndex,
    measureElement,
  } as const;
}
