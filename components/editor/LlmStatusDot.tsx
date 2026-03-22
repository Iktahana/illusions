"use client";

import clsx from "clsx";
import type { LlmStatusState } from "@/lib/hooks/use-llm-status";

const LLM_STATUS_LABELS: Record<LlmStatusState, string> = {
  off: "AI: 無効",
  loading: "AI: 読み込み中",
  ready: "AI: 準備完了",
  inferring: "AI: 推論中",
};

export default function LlmStatusDot({ status }: { status: LlmStatusState }) {
  const dotClass = clsx(
    "w-2.5 h-2.5 rounded-full shrink-0 transition-colors",
    {
      "bg-foreground-muted": status === "off",
      "bg-yellow-400": status === "loading",
      "bg-emerald-500": status === "ready",
      "bg-emerald-500 animate-llm-pulse": status === "inferring",
    },
  );

  return (
    <span title={LLM_STATUS_LABELS[status]} className="flex items-center">
      <span className={dotClass} />
    </span>
  );
}
