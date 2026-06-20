"use client";

import type React from "react";
import { Store } from "lucide-react";

export default function MarketplaceEntryCard(): React.ReactElement {
  return (
    <div className="border-2 border-dashed border-border rounded-lg p-4 flex items-center gap-3 opacity-60">
      <Store className="w-5 h-5 text-foreground-tertiary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground-secondary">ルールセットを入手</p>
        <p className="text-xs text-foreground-tertiary mt-0.5">近日公開予定</p>
      </div>
      <span className="text-[10px] text-foreground-tertiary border border-border rounded px-1.5 py-0.5 flex-shrink-0">
        準備中
      </span>
    </div>
  );
}
