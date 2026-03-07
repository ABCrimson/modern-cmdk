'use client';

// packages/command-react/src/activity.tsx
// <CommandActivity> — React 19.3.0-canary Activity API for state preservation
// Wraps palette contents in <Activity mode="hidden"> when dialog closes
// Preserves scroll position, input state, selection without remount
// Graceful degradation: falls back to normal unmount if Activity unavailable

import type { ReactNode } from 'react';
import * as React from 'react';

/** Props for the CommandActivity wrapper that controls visibility via React's Activity API. */
export interface CommandActivityProps {
  /** Whether the wrapped content is active (visible) */
  readonly mode: 'visible' | 'hidden';
  readonly children: ReactNode;
}

// Check if React.Activity (unstable) is available in this canary build
const ActivityComponent =
  'Activity' in React
    ? ((React as Record<string, unknown>).Activity as React.ComponentType<{
        mode: 'visible' | 'hidden';
        children: ReactNode;
      }>)
    : null;

/**
 * Wraps content in React 19.3.0-canary Activity API.
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
