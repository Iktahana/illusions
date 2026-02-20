"use client";

/**
 * Global Error Boundary for the entire application.
 * Catches errors that occur in the root layout.
 * Must include its own <html> and <body> tags.
 *
 * アプリケーション全体のグローバルエラーバウンダリ。
 * ルートレイアウトで発生するエラーをキャッチする。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body>
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
            重大なエラーが発生しました
          </h2>
          <p style={{ color: "#666", margin: 0, maxWidth: "400px", textAlign: "center" }}>
            アプリケーションで重大なエラーが発生しました。再試行してください。
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 24px",
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            アプリケーションを再起動
          </button>
        </div>
      </body>
    </html>
  );
}
