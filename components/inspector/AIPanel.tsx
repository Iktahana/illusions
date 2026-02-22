"use client";

import { Bot } from "lucide-react";

/** AI assistant panel (placeholder for upcoming feature) */
export default function AIPanel() {
  return (
    <div className="space-y-4">
      <div className="bg-accent-light rounded-lg p-4 border border-border">
        <div className="flex items-start gap-3">
          <Bot className="w-5 h-5 text-accent mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">AI アシスタント</h3>
            <p className="text-xs text-foreground-tertiary">
              この機能は現在開発中です。今後のアップデートをお待ちください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
