'use client';

// packages/command-react/src/highlight.tsx
// <Command.Highlight> — renders search query match highlighting
// ES2026: Iterator Helpers (.map, .flatMap, .toArray) for range processing
// Isolated declarations: explicit return types on all exports

import type { ReactNode } from 'react';
import { useMemo } from 'react';

export interface CommandHighlightProps {
  /** The full text to display */
  readonly text: string;
  /** Match ranges from search scorer — [start, end] tuples */
  readonly ranges: ReadonlyArray<readonly [start: number, end: number]>;
  /** Custom className for highlighted segments */
  readonly highlightClassName?: string;
}

export function CommandHighlight({
  text,
  ranges,
  highlightClassName,
}: CommandHighlightProps): ReactNode {
  // Memoize the highlighted parts to avoid recomputation on parent re-renders
  const parts: ReactNode = useMemo(() => {
    if (ranges.length === 0) return text;

    // Sort ranges by start position — toSorted (ES2023+) avoids mutating the readonly input
    const sorted = ranges.toSorted((a, b) => a[0] - b[0]);

    const segments: ReactNode[] = [];
    let lastEnd = 0;

    // Build segments from sorted ranges — native Array.forEach provides (value, index)
    sorted.forEach(([start, end], i) => {
      // Text before the match
      if (start > lastEnd) {
        segments.push(text.slice(lastEnd, start));
      }

      // Highlighted match
      segments.push(
        <mark key={i} data-command-highlight="" className={highlightClassName}>
          {text.slice(start, end)}
        </mark>,
      );

      lastEnd = end;
    });

    // Remaining text after last match
    if (lastEnd < text.length) {
      segments.push(text.slice(lastEnd));
    }

    return <>{segments}</>;
  }, [text, ranges, highlightClassName]);

  return parts;
}
