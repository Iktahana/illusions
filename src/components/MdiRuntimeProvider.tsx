"use client";

import { useEffect, useState, type ReactNode } from "react";

import { getDocumentAdapter } from "@/lib/document-format";

type RuntimeState = "loading" | "ready" | "error";

interface MdiRuntimeProviderProps {
  children: ReactNode;
}

/**
 * Application startup boundary for the browser MDI WASM runtime.
 *
 * MDI's synchronous projection APIs throw until their asynchronous WASM
 * bootstrap has completed. Keeping that contract here prevents parent-page
 * hooks from racing a child editor effect during the first render.
 */
export function MdiRuntimeProvider({ children }: MdiRuntimeProviderProps): React.ReactElement {
  const [state, setState] = useState<RuntimeState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    void getDocumentAdapter("mdi")
      .initialize()
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch((error: unknown) => {
        console.error("MDI runtime の初期化に失敗しました:", error);
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state === "ready") return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="max-w-sm space-y-3 px-6 text-center" role="status" aria-live="polite">
        {state === "loading" ? (
          <p aria-busy="true">エディターを準備しています…</p>
        ) : (
          <>
            <p>MDI ランタイムを読み込めませんでした。</p>
            <button
              type="button"
              className="rounded border border-border px-3 py-2 hover:bg-hover"
              onClick={() => setAttempt((value) => value + 1)}
            >
              再試行
            </button>
          </>
        )}
      </div>
    </main>
  );
}
