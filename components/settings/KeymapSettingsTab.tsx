"use client";

import type React from "react";
import KeymapSettings from "../KeymapSettings";

/**
 * Settings tab for keyboard shortcut (keymap) configuration.
 */
export default function KeymapSettingsTab(): React.ReactElement {
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-foreground mb-1">キーマップ</h3>
      <KeymapSettings />
    </div>
  );
}
