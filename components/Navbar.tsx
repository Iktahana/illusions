"use client";

import { useEffect } from "react";
import { FileText, Save, Check, FolderOpen } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

interface NavbarProps {
  fileName: string | null;
  isSaving?: boolean;
  lastSaved?: Date | null;
  saveSuccessAt?: number | null;
  onClearSaveSuccess?: () => void;
  onOpenFile?: () => void;
}

export default function Navbar({
  fileName,
  isSaving = false,
  lastSaved,
  saveSuccessAt,
  onClearSaveSuccess,
  onOpenFile,
}: NavbarProps) {
  useEffect(() => {
    if (saveSuccessAt == null) return;
    const t = setTimeout(() => {
      onClearSaveSuccess?.();
    }, 2000);
    return () => clearTimeout(t);
  }, [saveSuccessAt, onClearSaveSuccess]);

  const formatLastSaved = (date?: Date | null) => {
    if (!date) return "";
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return "保存済み";
    if (diff < 3600) return `${Math.floor(diff / 60)}分前に保存`;
    return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  };

  const showToast = saveSuccessAt != null;

  return (
    <nav className="h-14 border-b border-border bg-background flex items-center justify-between px-4 relative">
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-foreground-secondary" />
        <span className="text-lg font-semibold text-foreground">Illusions</span>
        {onOpenFile && (
          <button
            type="button"
            onClick={onOpenFile}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium text-foreground-secondary hover:bg-hover transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            開く
          </button>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center">
        <h1 className="text-sm text-foreground-secondary max-w-md truncate">
          {fileName ?? "無題の文書"}
        </h1>
      </div>

      <div className="flex items-center gap-3 text-sm text-foreground-tertiary">
        {isSaving ? (
          <>
            <Save className="w-4 h-4 animate-pulse" />
            <span>保存中...</span>
          </>
        ) : (
          <>
            <Check className="w-4 h-4 text-success" />
            <span>{formatLastSaved(lastSaved)}</span>
          </>
        )}
        <ThemeToggle />
      </div>

      {showToast && (
        <div
          role="status"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-background-elevated text-foreground text-sm rounded-lg shadow-lg animate-fade-out border border-border"
        >
          保存しました
        </div>
      )}
    </nav>
  );
}
