"use client";

import type React from "react";

/**
 * Vertical writing settings tab.
 * Scroll behavior settings have been removed.
 */
export default function VerticalSettingsTab(): React.ReactElement {
  return (
    <div className="space-y-6">
      <p className="text-sm text-foreground-tertiary">縦書き固有の設定はありません。</p>
    </div>
  );
}
