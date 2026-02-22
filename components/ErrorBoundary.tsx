"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback UI */
  fallback?: React.ReactNode;
  /** Section name displayed in the fallback UI */
  sectionName?: string;
  /** Optional error callback */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary for catching render errors in child components.
 * Displays a Japanese fallback UI with a retry button.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `[ErrorBoundary${this.props.sectionName ? `: ${this.props.sectionName}` : ""}]`,
      error,
      errorInfo,
    );
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const label = this.props.sectionName ?? "コンポーネント";

      return (
        <div className="flex flex-col items-center justify-center h-full p-6 bg-background text-foreground">
          <div className="text-center space-y-3 max-w-sm">
            <p className="text-sm font-medium text-foreground-secondary">
              {label}の表示中にエラーが発生しました
            </p>
            <p className="text-xs text-foreground-tertiary break-all">
              {this.state.error?.message}
            </p>
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              再試行
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
