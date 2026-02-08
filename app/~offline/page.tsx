"use client";

export default function OfflinePage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>
        ✈
      </div>
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 600,
          marginBottom: "1rem",
        }}
      >
        オフラインです
      </h1>
      <p
        style={{
          fontSize: "1rem",
          color: "#94a3b8",
          maxWidth: "24rem",
          lineHeight: 1.6,
        }}
      >
        インターネットに接続されていません。接続が回復すると自動的に再読み込みされます。
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: "2rem",
          padding: "0.75rem 1.5rem",
          backgroundColor: "#334155",
          color: "#e2e8f0",
          border: "1px solid #475569",
          borderRadius: "0.5rem",
          cursor: "pointer",
          fontSize: "0.875rem",
        }}
      >
        再読み込み
      </button>
    </div>
  );
}
