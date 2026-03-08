'use client';

// packages/command-react/src/error-boundary.tsx
// Error boundary — class component (required by React for componentDidCatch)
// Isolated declarations: explicit return types on all exports

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface CommandErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode | ((error: Error) => ReactNode);
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface CommandErrorBoundaryState {
  readonly error: Error | null;
}

/** Initial state — no error captured */
const INITIAL_STATE: CommandErrorBoundaryState = {
  error: null,
} as const satisfies CommandErrorBoundaryState;

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

  override render(): ReactNode {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') return fallback(this.state.error);
      if (fallback) return fallback;
      return null;
    }
    return this.props.children;
  }
}
