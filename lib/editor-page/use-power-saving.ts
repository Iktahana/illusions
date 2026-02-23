/**
 * Power saving hook — simplified to a no-op.
 *
 * The original implementation detected battery state via Electron's powerMonitor
 * and auto-disabled linting/AI features. That responsibility has been moved to
 * LlmController (lib/linting/llm-controller.ts), which automatically unloads the
 * model after a configurable cooldown period. This provides equivalent power
 * efficiency without requiring battery-state detection.
 *
 * The hook signature is preserved so existing callers in app/page.tsx do not
 * need to be changed.
 */

interface UsePowerSavingOptions {
  powerSaveMode: boolean;
  autoPowerSaveOnBattery: boolean;
  onPowerSaveModeChange: (enabled: boolean) => void;
}

/**
 * No-op hook. Power-save behaviour is now handled by LlmController auto unload.
 * Kept for API compatibility — callers do not need to be updated.
 */
export function usePowerSaving(
  _options: UsePowerSavingOptions,
): void {
  // Intentional no-op.
  // LlmController (lib/linting/llm-controller.ts) handles power efficiency by
  // automatically unloading the model after `cooldownMs` of inactivity.
}
