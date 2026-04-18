"use client";

import type React from "react";

import { usePowerSettings } from "@/contexts/EditorSettingsContext";
import { SettingsField, SettingsSection, SettingsToggle } from "./primitives";

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
    <SettingsSection
      title="省電力モード"
      description="省電力モードを有効にすると、校正機能と AI 関連機能が一時的に無効になり、バッテリー消費を抑えます。"
    >
      <SettingsField
        label="省電力モードを有効にする"
        htmlFor="power-save-mode"
        inline
      >
        <SettingsToggle
          id="power-save-mode"
          checked={powerSaveMode ?? false}
          onChange={(next) => onPowerSaveModeChange?.(next)}
        />
      </SettingsField>

      <SettingsField
        label="バッテリー駆動時に自動で省電力モードを提案する"
        htmlFor="power-auto-battery"
        inline
      >
        <SettingsToggle
          id="power-auto-battery"
          checked={autoPowerSaveOnBattery ?? true}
          onChange={(next) => onAutoPowerSaveOnBatteryChange?.(next)}
        />
      </SettingsField>

      <div className="text-xs text-foreground-secondary space-y-1">
        <p>・AC 電源接続時に自動的に省電力モードを解除します</p>
        <p>・省電力モードを解除すると、以前の校正・AI 設定が復元されます</p>
      </div>
    </SettingsSection>
  );
}
