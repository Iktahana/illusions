/**
 * Power saving hook — simplified to a no-op.
 *
 * The original implementation detected battery state via Electron's powerMonitor
 * and auto-disabled linting/AI features. The hook signature is preserved so
 * existing callers in app/page.tsx do not need to be changed.
 */

interface UsePowerSavingOptions {
  powerSaveMode: boolean;
  autoPowerSaveOnBattery: boolean;
  onPowerSaveModeChange: (enabled: boolean) => void;
}

/**
 * No-op hook. Kept for API compatibility — callers do not need to be updated.
 */
export function usePowerSaving(
  _options: UsePowerSavingOptions,
): void {
  // Intentional no-op.
}
