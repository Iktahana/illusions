"use client";

import type React from "react";
import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import clsx from "clsx";

import { useIgnoredCorrectionsContext } from "@/contexts/IgnoredCorrectionsContext";
import { notificationManager } from "@/lib/services/notification-manager";

/**
 * Clears every "ignored correction" the user has accumulated, so previously
 * dismissed lint issues surface again. Destructive, so it requires a two-step
 * inline confirmation. Renders nothing when used outside the editor tree
 * (no provider), e.g. the popout editor window.
 */
export default function ClearIgnoredCorrectionsButton(): React.ReactElement | null {
  const ctx = useIgnoredCorrectionsContext();
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  if (!ctx) return null;

  const handleClear = async (): Promise<void> => {
    setClearing(true);
    try {
      await ctx.clear();
      notificationManager.success("無視した校正の記憶をすべて消去しました");
      setConfirming(false);
    } catch (err) {
      console.error("[ClearIgnoredCorrectionsButton] clear failed:", err);
      notificationManager.error("無視した校正の消去に失敗しました");
    } finally {
      setClearing(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-foreground-secondary flex-1">
          すべての無視記憶を消去します。元に戻せません。
        </span>
        <button
          type="button"
          onClick={() => void handleClear()}
          disabled={clearing}
          className="flex items-center gap-1 text-xs px-2 py-1 border border-danger/50 text-danger rounded hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          すべて消去
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={clearing}
          className="text-xs px-2 py-1 border border-border rounded hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          キャンセル
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className={clsx(
        "flex items-center gap-1 text-xs px-2 py-1 border border-border rounded transition-colors",
        "hover:bg-danger/10 hover:border-danger/50 hover:text-danger",
      )}
    >
      <Trash2 className="w-3 h-3" />
      無視した校正をすべて消去
    </button>
  );
}
