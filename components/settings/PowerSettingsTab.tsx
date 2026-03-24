"use client";

import type React from "react";
import { usePowerSettings } from "@/contexts/EditorSettingsContext";

/**
 * Settings tab for power saving (Electron only).
 * Covers: manual power save mode toggle and auto-suggest on battery.
 */
export default function PowerSettingsTab(): React.ReactElement {
  const {
    powerSaveMode,
    autoPowerSaveOnBattery,
    onPowerSaveModeChange,
    onAutoPowerSaveOnBatteryChange,
  } = usePowerSettings();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-1">省電力モード</h3>
        <p className="text-sm text-foreground-secondary mb-4">
          省電力モードを有効にすると、校正機能とAI関連機能が一時的に無効になり、バッテリー消費を抑えます。
        </p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={powerSaveMode ?? false}
            onChange={(e) => onPowerSaveModeChange?.(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-accent"
          />
          <span className="text-sm font-medium text-foreground">省電力モードを有効にする</span>
        </label>
      </div>
      <div className="mt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoPowerSaveOnBattery ?? true}
            onChange={(e) => onAutoPowerSaveOnBatteryChange?.(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-accent"
          />
          <span className="text-sm font-medium text-foreground">バッテリー駆動時に自動で省電力モードを提案する</span>
        </label>
      </div>
      <div className="text-xs text-foreground-secondary space-y-1">
        <p>• AC電源接続時に自動的に省電力モードを解除します</p>
        <p>• 省電力モードを解除すると、以前の校正・AI設定が復元されます</p>
      </div>
    </div>
  );
}
