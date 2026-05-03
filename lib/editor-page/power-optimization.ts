export interface RuntimeActivityState {
  powerSaveMode: boolean;
  isDocumentVisible: boolean;
  isWindowFocused: boolean;
}

/**
 * Throttled auto-save interval used when the app is in power-save mode or the
 * window is backgrounded. This keeps recovery protection active while reducing
 * timer wake-ups and background disk writes.
 */
export const THROTTLED_AUTO_SAVE_INTERVAL_MS = 20_000;

/**
 * Power-saving rubric for new work:
 * - Keep user-visible, correctness-critical, and recovery-critical work running.
 * - Throttle periodic/background work instead of stopping it when safety matters.
 * - Suspend decorative or analysis-heavy work when the app is backgrounded or
 *   when power-save mode is explicitly enabled.
 */
export function isBackgroundWindow(state: RuntimeActivityState): boolean {
  return !state.isDocumentVisible || !state.isWindowFocused;
}

export function shouldSuspendNonCriticalProcessing(state: RuntimeActivityState): boolean {
  return state.powerSaveMode || isBackgroundWindow(state);
}

export function shouldRunReadabilityMorphology(state: RuntimeActivityState): boolean {
  return !shouldSuspendNonCriticalProcessing(state);
}

export function shouldEnablePosHighlight(
  userEnabled: boolean,
  state: RuntimeActivityState,
): boolean {
  return userEnabled && !shouldSuspendNonCriticalProcessing(state);
}

export function shouldPauseFileWatchers(state: RuntimeActivityState): boolean {
  return isBackgroundWindow(state);
}

export function getAutoSaveIntervalMs(
  state: RuntimeActivityState,
  baseIntervalMs: number,
  throttledIntervalMs: number = THROTTLED_AUTO_SAVE_INTERVAL_MS,
): number {
  if (!shouldSuspendNonCriticalProcessing(state)) {
    return baseIntervalMs;
  }

  return Math.max(baseIntervalMs, throttledIntervalMs);
}
