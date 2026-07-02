"use client";

import { useEffect } from "react";

export function ErrorReportingRuntime(): null {
  useEffect(() => {
    if (!window.electronAPI?.errorReporting) return;

    const onError = (event: ErrorEvent): void => {
      void window.electronAPI?.errorReporting?.captureRendererError({
        source: "window-error",
        name: event.error instanceof Error ? event.error.name : undefined,
        message: event.message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      const reason = event.reason;
      void window.electronAPI?.errorReporting?.captureRendererError({
        source: "unhandledrejection",
        name: reason instanceof Error ? reason.name : undefined,
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
