// packages/modern-cmdk/src/react/activity.tsx
// <Command.Activity> — passes its `mode` prop to React's <Activity> around its children
// The caller chooses the mode; nothing in the library derives it from the dialog's open state
// Activity is feature-detected: on a React that exports none, 'hidden' renders null (the children
// unmount) and 'visible' renders the children as they are
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
