'use client';

// packages/command-react/src/highlight.tsx
// <Command.Highlight> — renders search query match highlighting

import type { ReactNode } from 'react';

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
  if (ranges.length === 0) {
    return <>{text}</>;
  }

  // Sort ranges by start position
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let lastEnd = 0;

  for (let i = 0; i < sorted.length; i++) {
    const [start, end] = sorted[i]!;

    // Text before the match
    if (start > lastEnd) {
      parts.push(text.slice(lastEnd, start));
    }

    // Highlighted match
    parts.push(
      <mark key={i} data-command-highlight="" className={highlightClassName}>
        {text.slice(start, end)}
      </mark>,
    );

    lastEnd = end;
  }

  // Remaining text after last match
  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd));
  }

  return <>{parts}</>;
}
