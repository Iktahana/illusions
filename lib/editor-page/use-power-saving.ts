/**
 * Power saving hook — detects battery/AC state via Electron's powerMonitor
 * and auto-toggles power-save mode when `autoPowerSaveOnBattery` is enabled.
 *
 * On battery → enables power-save mode (disables linting/AI)
 * On AC      → disables power-save mode (restores previous settings)
 *
 * In non-Electron environments or when `autoPowerSaveOnBattery` is off,
 * this hook is effectively a no-op.
 */

import { useEffect, useRef } from "react";

import { isElectronRenderer } from "@/lib/utils/runtime-env";

interface UsePowerSavingOptions {
  powerSaveMode: boolean;
  autoPowerSaveOnBattery: boolean;
  onPowerSaveModeChange: (enabled: boolean) => void;
}

/**
 * Monitors power source changes in Electron and auto-toggles power-save mode.
 * When `autoPowerSaveOnBattery` is enabled:
 *   - Switches to battery → `onPowerSaveModeChange(true)`
 *   - Switches to AC      → `onPowerSaveModeChange(false)`
 */
export function usePowerSaving(
  options: UsePowerSavingOptions,
): void {
  const { powerSaveMode, autoPowerSaveOnBattery, onPowerSaveModeChange } = options;

  // Use refs so the listener callback always sees latest values without
  // needing to re-subscribe on every render.
  const powerSaveModeRef = useRef(powerSaveMode);
  const autoPowerSaveRef = useRef(autoPowerSaveOnBattery);
  const onChangeRef = useRef(onPowerSaveModeChange);

  useEffect(() => {
    powerSaveModeRef.current = powerSaveMode;
  }, [powerSaveMode]);

  useEffect(() => {
    autoPowerSaveRef.current = autoPowerSaveOnBattery;
  }, [autoPowerSaveOnBattery]);

  useEffect(() => {
    onChangeRef.current = onPowerSaveModeChange;
  }, [onPowerSaveModeChange]);

  useEffect(() => {
    if (!isElectronRenderer()) return;

    const powerApi = window.electronAPI?.power;
    if (!powerApi) return;

    // Check initial power state on mount
    void powerApi.getPowerState().then((state) => {
      if (!autoPowerSaveRef.current) return;
      if (state === "battery" && !powerSaveModeRef.current) {
        onChangeRef.current(true);
      }
    });

    // Subscribe to power state changes
    const unsubscribe = powerApi.onPowerStateChange((state) => {
      if (!autoPowerSaveRef.current) return;

      if (state === "battery" && !powerSaveModeRef.current) {
        onChangeRef.current(true);
      } else if (state === "ac" && powerSaveModeRef.current) {
        onChangeRef.current(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []); // Subscribe once on mount, refs keep values current
}
