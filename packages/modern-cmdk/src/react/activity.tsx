'use client';

// packages/command-react/src/activity.tsx
// <CommandActivity> — React's <Activity> API (stable since React 19.2) for state preservation
// Wraps palette contents in <Activity mode="hidden"> when dialog closes
// Preserves scroll position, input state, selection without remount
// Graceful degradation: falls back to normal unmount if Activity unavailable
// Isolated declarations: explicit return types on all exports

import type { ComponentType, ReactNode } from 'react';
import * as React from 'react';

/** Activity mode — maps directly to React's Activity API */
export type ActivityMode = 'visible' | 'hidden';

/** Props for the CommandActivity wrapper that controls visibility via React's Activity API. */
export interface CommandActivityProps {
  /** Whether the wrapped content is active (visible) */
  readonly mode: ActivityMode;
  readonly children: ReactNode;
}

/** Props shape for the internal Activity component */
interface ActivityComponentProps {
  readonly mode: ActivityMode;
  readonly children: ReactNode;
}

// Feature-detect React.Activity: the peer range starts at React 19.0, which predates it
const ActivityComponent: ComponentType<ActivityComponentProps> | null =
  'Activity' in React
    ? ((React as Record<string, unknown>).Activity as ComponentType<ActivityComponentProps>)
    : null;

/**
 * Wraps content in React's <Activity> API (React 19.2+).
 * When mode="hidden", the component tree is preserved in memory but not rendered.
 * Falls back to conditional rendering if Activity is unavailable.
 */
export function CommandActivity({ mode, children }: CommandActivityProps): ReactNode {
  if (ActivityComponent) {
    return <ActivityComponent mode={mode}>{children}</ActivityComponent>;
  }

  // Graceful degradation — unmount when hidden
  if (mode === 'hidden') return null;
  return <>{children}</>;
}
