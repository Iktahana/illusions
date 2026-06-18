import { useEffect, useRef } from "react";

type PowerState = "ac" | "battery";

/** Minimum gap between battery suggestions, to absorb rapid power bounce. */
const SUGGEST_THROTTLE_MS = 60_000;

/**
 * Last suggestion time, MODULE-scoped on purpose: the notification is a global
 * singleton, so the throttle must be too. A per-hook ref would reset to 0 when
 * the consumer (the editor page) remounts during startup — producing a second,
 * duplicate toast from the fresh instance. Module scope dedupes across mounts.
 */
let lastSuggestAt = 0;

/** @internal test-only: reset the module-scoped suggestion throttle. */
export function __resetSuggestThrottleForTest(): void {
  lastSuggestAt = 0;
}

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

    const handleTransition = (state: PowerState): void => {
      if (disposed) return;
      // Only react to genuine transitions; ignore repeated same-state reads.
      if (lastStateRef.current === state) return;
      const prev = lastStateRef.current;
      lastStateRef.current = state;

      if (state === "battery") {
        // Suggest, never force. Skip if power-save is already on, the user
        // opted out, or we suggested very recently (debounce bounce).
        const now = Date.now();
        if (
          autoOnBatteryRef.current &&
          !powerSaveModeRef.current &&
          now - lastSuggestAt > SUGGEST_THROTTLE_MS
        ) {
          lastSuggestAt = now;
          onSuggestRef.current();
        }
      } else if (prev !== null) {
        // Auto-disable only on a REAL battery→AC transition. We must NOT act on
        // the initial mount reading (prev === null): at startup the persisted
        // powerSaveMode is still hydrating, and disabling here races with the
        // restore path — it would clear prePowerSaveState and strand linting
        // off. On mount we respect the persisted/hydrated value instead.
        onChangeRef.current(false);
      }
    };

    // Subscribe FIRST so a transition during the initial async read is not
    // missed, then apply the initial reading only if nothing was observed yet
    // (guards against an out-of-order initial result overwriting a real
    // transition that already arrived).
    const unsubscribe = powerAPI.onPowerStateChange(handleTransition);
    powerAPI.getPowerState().then((state) => {
      if (disposed) return;
      if (lastStateRef.current === null) handleTransition(state);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
    // Mount once: all inputs are read through refs, so the subscription is
    // never torn down and re-created by unrelated re-renders.
  }, []);
}
