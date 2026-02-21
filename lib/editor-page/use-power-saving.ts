import { useEffect, useRef } from "react";

import { isElectronRenderer } from "@/lib/runtime-env";

interface UsePowerSavingOptions {
  powerSaveMode: boolean;
  onPowerSaveModeChange: (enabled: boolean) => void;
}

/**
 * Listens for Electron powerMonitor events and manages power saving mode.
 * - On battery (>1min debounced): shows native dialog prompt
 * - On AC (>1min debounced): auto-disables power saving mode
 * - No-op on web platform
 */
export function usePowerSaving({
  powerSaveMode,
  onPowerSaveModeChange,
}: UsePowerSavingOptions): void {
  // Use refs to avoid stale closures in the IPC callback
  const powerSaveModeRef = useRef(powerSaveMode);
  powerSaveModeRef.current = powerSaveMode;

  const onChangeRef = useRef(onPowerSaveModeChange);
  onChangeRef.current = onPowerSaveModeChange;

  useEffect(() => {
    if (!isElectronRenderer()) return;
    const api = window.electronAPI;
    if (!api?.power) return;

    const cleanup = api.power.onPowerStateChange(async (state) => {
      if (state === "battery" && !powerSaveModeRef.current) {
        // Show native dialog asking user to enable power saving
        const result = await api.power!.showBatteryPrompt();
        if (result === "enable") {
          onChangeRef.current(true);
        }
      } else if (state === "ac" && powerSaveModeRef.current) {
        // Auto-restore when plugged in
        onChangeRef.current(false);
      }
    });

    return () => {
      cleanup?.();
      api.power?.removeOnPowerStateChange();
    };
  }, []); // Empty deps -- refs handle state updates
}
