"use client";

import { useEffect, useState } from "react";

export default function AiStatusIndicator() {
  const [aiAvailable, setAiAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const ai = window.ai;
        if (!ai?.canCreateTextSession) {
          if (!cancelled) setAiAvailable(false);
          return;
        }
        const status = await ai.canCreateTextSession();
        if (!cancelled) setAiAvailable(status === "readily");
      } catch {
        if (!cancelled) setAiAvailable(false);
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-1.5 bg-background backdrop-blur-sm border border-border rounded-lg shadow-sm text-xs">
      <div
        className={
          aiAvailable
            ? "w-2 h-2 rounded-full bg-success"
            : "w-2 h-2 rounded-full bg-foreground-muted"
        }
      />
      <span className={aiAvailable ? "text-success font-medium" : "text-foreground-tertiary"}>
        {aiAvailable ? "Native AI Mode: ON" : "AI Offline"}
      </span>
    </div>
  );
}

