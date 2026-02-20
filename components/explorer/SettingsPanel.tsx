"use client";

import { Settings } from "lucide-react";

/** Placeholder panel for project settings (under development) */
export function SettingsPanel() {
  return (
    <div className="space-y-4">
      <div className="bg-background-secondary rounded-lg p-4 border border-border">
        <div className="flex items-start gap-3">
          <Settings className="w-5 h-5 text-foreground-tertiary mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">プロジェクト設定</h3>
            <p className="text-xs text-foreground-tertiary">
              この機能は現在開発中です。今後のアップデートをお待ちください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
