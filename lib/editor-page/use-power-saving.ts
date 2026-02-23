import { useEffect, useRef } from "react";

import { isElectronRenderer } from "@/lib/runtime-env";
import { notificationManager } from "@/lib/notification-manager";

interface UsePowerSavingOptions {
  powerSaveMode: boolean;
  autoPowerSaveOnBattery: boolean;
  onPowerSaveModeChange: (enabled: boolean) => void;
}

/**
 * Listens for Electron powerMonitor events and manages power saving mode.
 * - On battery: shows in-app notification with action buttons
 * - On AC: auto-disables power saving mode with info notification
 * - No-op on web platform
 */
export function usePowerSaving({
  powerSaveMode,
  autoPowerSaveOnBattery,
  onPowerSaveModeChange,
}: UsePowerSavingOptions): void {
  // Use refs to avoid stale closures in the IPC callback
  const powerSaveModeRef = useRef(powerSaveMode);
  powerSaveModeRef.current = powerSaveMode;

  const autoPowerSaveRef = useRef(autoPowerSaveOnBattery);
  autoPowerSaveRef.current = autoPowerSaveOnBattery;

  const onChangeRef = useRef(onPowerSaveModeChange);
  onChangeRef.current = onPowerSaveModeChange;

  useEffect(() => {
    if (!isElectronRenderer()) return;
    const api = window.electronAPI;
    if (!api?.power) return;

    const cleanup = api.power.onPowerStateChange((state) => {
      if (state === "battery" && !powerSaveModeRef.current && autoPowerSaveRef.current) {
        // Show in-app notification with action buttons
        notificationManager.showMessage(
          "バッテリー駆動を検出しました。省電力モードを有効にしますか？\n校正機能とAI関連機能が一時的に無効になります。",
          {
            type: "warning",
            duration: 0, // No auto-dismiss — require user action
            actions: [
              {
                label: "有効にする",
                onClick: () => onChangeRef.current(true),
              },
              {
                label: "後で",
                onClick: () => {
                  // No-op — dismiss handled by Notification component
                },
              },
            ],
          },
        );
      } else if (state === "ac" && powerSaveModeRef.current) {
        // Auto-restore when plugged in
        onChangeRef.current(false);
        notificationManager.info(
          "AC電源を検出しました。省電力モードを解除しました。",
        );
      }
    });

    return () => {
      cleanup?.();
    };
  }, []); // Empty deps -- refs handle state updates
}
