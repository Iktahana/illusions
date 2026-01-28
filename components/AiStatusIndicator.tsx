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
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm text-xs">
      <div
        className={
          aiAvailable
            ? "w-2 h-2 rounded-full bg-green-500"
            : "w-2 h-2 rounded-full bg-slate-400"
        }
      />
      <span className={aiAvailable ? "text-green-700 font-medium" : "text-slate-500"}>
        {aiAvailable ? "Native AI Mode: ON" : "AI Offline"}
      </span>
    </div>
  );
}

