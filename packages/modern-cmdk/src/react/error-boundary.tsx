// packages/modern-cmdk/src/react/error-boundary.tsx
// Error boundary — class component (required by React for componentDidCatch)
// Isolated declarations: explicit return types on all exports

import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Props of {@link CommandErrorBoundary}: the subtree to guard, what to show after an error, and an error callback. */
export interface CommandErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * Rendered in place of the children after an error. A function receives the error and a `reset`
   * callback that clears it, so the children render again (a retry button, for example).
   */
  readonly fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode) | undefined;
  /**
   * While the boundary shows its fallback, a change in these values (compared entry by entry with
   * `Object.is`; a different length counts as a change) clears the error and renders the children again.
   */
  readonly resetKeys?: readonly unknown[] | undefined;
  /** Called with the error and React's `errorInfo` when the boundary catches an error from its subtree */
  readonly onError?: ((error: Error, errorInfo: ErrorInfo) => void) | undefined;
}

interface CommandErrorBoundaryState {
  readonly error: Error | null;
}

/** Initial state — no error captured */
const INITIAL_STATE: CommandErrorBoundaryState = {
  error: null,
} as const satisfies CommandErrorBoundaryState;

/** Error boundary for graceful failure recovery in command subtrees. */
export class CommandErrorBoundary extends Component<
  CommandErrorBoundaryProps,
  CommandErrorBoundaryState
> {
  override state: CommandErrorBoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(error: Error): CommandErrorBoundaryState {
    return { error } satisfies CommandErrorBoundaryState;
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  override componentDidUpdate(
    prevProps: CommandErrorBoundaryProps,
    prevState: CommandErrorBoundaryState,
  ): void {
    if (this.state.error === null || prevState.error === null) return;
    const prev = prevProps.resetKeys;
    const next = this.props.resetKeys;
    if (
      prev !== next &&
      (prev?.length !== next?.length || next?.some((key, index) => !Object.is(key, prev?.[index])))
    ) {
      this.reset();
    }
  }

  /** Clears the captured error so the children render again. */
  reset = (): void => {
    this.setState(INITIAL_STATE);
  };

  override render(): ReactNode {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') return fallback(this.state.error, this.reset);
      if (fallback) return fallback;
      return null;
    }
    return this.props.children;
  }
}
