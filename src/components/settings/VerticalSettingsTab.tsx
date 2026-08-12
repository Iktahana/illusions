"use client";

import type React from "react";

import { SettingsSection } from "./primitives";

/**
 * Vertical scrolling follows the editor plugin's reading-direction behavior.
 */
export default function VerticalSettingsTab(): React.ReactElement {
  return (
    <SettingsSection title="スクロールと縦書き">
      <p className="text-sm text-foreground-secondary">
        縦書きのホイール／トラックパッド操作は、読み進める方向に合わせて自動的に処理されます。
      </p>
    </SettingsSection>
  );
}
