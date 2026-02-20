"use client";

import { useEffect } from "react";

/**
 * Next.js Error Boundary for the main page.
 * Catches render errors and provides a recovery UI.
 *
 * メインページのエラーバウンダリ。
 * レンダリングエラーをキャッチし、復旧UIを提供する。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: "16px",
        fontFamily: "system-ui, sans-serif",
        color: "#333",
        backgroundColor: "#fafafa",
      }}
    >
      <h2 style={{ fontSize: "1.5rem", margin: 0 }}>
        エラーが発生しました
      </h2>
      <p style={{ color: "#666", margin: 0, maxWidth: "400px", textAlign: "center" }}>
        予期しないエラーが発生しました。下のボタンで復旧を試みてください。
      </p>
      <button
        onClick={reset}
        style={{
          padding: "8px 24px",
          backgroundColor: "#0070f3",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "1rem",
        }}
      >
        再試行
      </button>
    </div>
  );
}
