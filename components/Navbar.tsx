"use client";

import { FileText, Save, Check } from "lucide-react";
import { useStorage } from "@/lib/storage-context";

interface NavbarProps {
  isSaving?: boolean;
  lastSaved?: Date;
}

export default function Navbar({ isSaving = false, lastSaved }: NavbarProps) {
  const { currentDocument } = useStorage();

  const formatLastSaved = (date?: Date) => {
    if (!date) return "";
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return "保存済み";
    if (diff < 3600) return `${Math.floor(diff / 60)}分前に保存`;
    return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <nav className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-4">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-slate-700" />
        <span className="text-lg font-semibold text-slate-800">Illusions</span>
      </div>

      {/* Center: Document Title */}
      <div className="flex-1 flex items-center justify-center">
        <h1 className="text-sm text-slate-600 max-w-md truncate">
          {currentDocument?.title || "無題の文書"}
        </h1>
      </div>

      {/* Right: Save Status & Avatar */}
      <div className="flex items-center gap-4">
        {/* Save Status */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          {isSaving ? (
            <>
              <Save className="w-4 h-4 animate-pulse" />
              <span>保存中...</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4 text-green-600" />
              <span>{formatLastSaved(lastSaved)}</span>
            </>
          )}
        </div>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
          U
        </div>
      </div>
    </nav>
  );
}
