import { useEffect } from "react";

interface UsePowerSavingOptions {
  powerSaveMode: boolean;
  autoPowerSaveOnBattery: boolean;
  onPowerSaveModeChange: (enabled: boolean) => void;
}

/**
 * Listens for Electron power state changes and auto-switches power saving mode.
 *
 * - When on battery and `autoPowerSaveOnBattery` is enabled, power saving is turned on.
 * - When AC power is restored, power saving is turned off.
 * - Does nothing on web (no `window.electronAPI?.power`).
 */
export function usePowerSaving({
  autoPowerSaveOnBattery,
  onPowerSaveModeChange,
}: UsePowerSavingOptions): void {
  useEffect(() => {
    const powerAPI = window.electronAPI?.power;
    if (!powerAPI) {
      return;
    }

    // Apply the current state immediately on mount.
    powerAPI.getPowerState().then((state) => {
      if (state === "battery" && autoPowerSaveOnBattery) {
        onPowerSaveModeChange(true);
      } else if (state === "ac") {
        onPowerSaveModeChange(false);
      }
    });

    // Subscribe to future state changes.
    const unsubscribe = powerAPI.onPowerStateChange((state) => {
      if (state === "battery" && autoPowerSaveOnBattery) {
        onPowerSaveModeChange(true);
      } else if (state === "ac") {
        onPowerSaveModeChange(false);
      }
    });

    return () => {
      unsubscribe();
    };
    // Re-run when autoPowerSaveOnBattery changes or when the callback identity
    // changes (i.e. when the caller's useCallback deps — lintingEnabled,
    // lintingRuleConfigs — are updated).
  }, [autoPowerSaveOnBattery, onPowerSaveModeChange]);
}
