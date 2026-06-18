import { useEffect, useRef } from "react";

type PowerState = "ac" | "battery";

interface UsePowerSavingOptions {
  /** Current power-save mode, so we never re-suggest while already enabled. */
  powerSaveMode: boolean;
  /** Whether to surface the battery suggestion at all. */
  autoPowerSaveOnBattery: boolean;
  /** Apply a concrete power-save change (used to auto-disable on AC). */
  onPowerSaveModeChange: (enabled: boolean) => void;
  /** Surface a non-forcing "switch to power-save?" suggestion to the user. */
  onSuggestPowerSave: () => void;
}

/**
 * Reacts to Electron power-state transitions.
 *
 * Design (#1402 follow-up): the previous implementation *forced* power-save
 * mode ON whenever it saw `battery`, and did so on every effect re-run — not
 * just on real transitions. Because the apply callback's identity changed
 * whenever linting state changed, the effect re-subscribed and re-fired,
 * instantly re-enabling power-save the moment the user turned it off. That
 * made power-save impossible to disable on battery.
 *
 * Now:
 * - We only act on genuine power-state TRANSITIONS (tracked via a ref), so an
 *   effect re-run with the same state is a no-op.
 * - On AC→battery we SUGGEST power-save via a toast (`onSuggestPowerSave`)
 *   instead of forcing it. The user stays in control — matching the setting's
 *   wording, "バッテリー駆動時に自動で省電力モードを提案する".
 * - On battery→AC we auto-disable power-save (this direction never traps the
 *   user and restores full functionality).
 * - All callbacks/flags are read through refs so the effect mounts once and
 *   never re-subscribes; identity churn can no longer cause spurious toggles.
 *
 * Does nothing on web (no `window.electronAPI?.power`).
 */
export function usePowerSaving({
  powerSaveMode,
  autoPowerSaveOnBattery,
  onPowerSaveModeChange,
  onSuggestPowerSave,
}: UsePowerSavingOptions): void {
  const powerSaveModeRef = useRef(powerSaveMode);
  powerSaveModeRef.current = powerSaveMode;
  const autoOnBatteryRef = useRef(autoPowerSaveOnBattery);
  autoOnBatteryRef.current = autoPowerSaveOnBattery;
  const onChangeRef = useRef(onPowerSaveModeChange);
  onChangeRef.current = onPowerSaveModeChange;
  const onSuggestRef = useRef(onSuggestPowerSave);
  onSuggestRef.current = onSuggestPowerSave;

  /** Last power state we acted on; null until the first reading. */
  const lastStateRef = useRef<PowerState | null>(null);

  useEffect(() => {
    const powerAPI = window.electronAPI?.power;
    if (!powerAPI) {
      return;
    }

    let disposed = false;

    const handleState = (state: PowerState): void => {
      if (disposed) return;
      // Only react to genuine transitions; ignore repeated same-state reads.
      if (lastStateRef.current === state) return;
      lastStateRef.current = state;

      if (state === "battery") {
        // Suggest, never force. Skip if power-save is already on or the user
        // opted out of the suggestion.
        if (autoOnBatteryRef.current && !powerSaveModeRef.current) {
          onSuggestRef.current();
        }
      } else {
        // AC restored: auto-disable power-save to restore full functionality.
        onChangeRef.current(false);
      }
    };

    // Apply the current state once on mount.
    powerAPI.getPowerState().then(handleState);

    // Subscribe to future transitions.
    const unsubscribe = powerAPI.onPowerStateChange(handleState);

    return () => {
      disposed = true;
      unsubscribe();
    };
    // Mount once: all inputs are read through refs, so the subscription is
    // never torn down and re-created by unrelated re-renders.
  }, []);
}
