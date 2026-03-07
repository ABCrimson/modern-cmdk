'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface CommandErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode | ((error: Error) => ReactNode);
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface CommandErrorBoundaryState {
  readonly error: Error | null;
}

export class CommandErrorBoundary extends Component<CommandErrorBoundaryProps, CommandErrorBoundaryState> {
  override state: CommandErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): CommandErrorBoundaryState {
    return { error };
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
