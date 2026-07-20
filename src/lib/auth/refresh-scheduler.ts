/**
 * Refresh timer scheduler shared by the Electron and Web auth session flows.
 *
 * Owns exactly one pending timer at a time and guarantees cleanup:
 * - `clear()` cancels the pending timer (used on logout).
 * - `dispose()` cancels the pending timer AND permanently rejects any future
 *   `schedule()` call. This is the #1567 fix: the async session restore can
 *   complete *after* the provider unmounted, and previously it would schedule
 *   a refresh timer that nothing could ever clear. A disposed scheduler turns
 *   that late schedule into a no-op.
 */

/** Refresh this long before the access token expires. */
export const REFRESH_LEAD_MS = 5 * 60 * 1000;

/**
 * Floor of 60s prevents a tight retry loop when the upstream token has
 * already expired (the delay would otherwise compute to 0 and the
 * transient-error branch would re-schedule immediately).
 */
export const TRANSIENT_RETRY_MIN_MS = 60 * 1000;

export function computeRefreshDelay(expiresAt: number, now: number = Date.now()): number {
  return Math.max(expiresAt - now - REFRESH_LEAD_MS, TRANSIENT_RETRY_MIN_MS);
}

export interface RefreshScheduler {
  /** Replace any pending timer with one that runs `task` before `expiresAt`. */
  schedule(expiresAt: number, task: () => void | Promise<void>): void;
  /** Cancel the pending timer (logout). The scheduler stays usable. */
  clear(): void;
  /** Cancel the pending timer and reject all future schedules (unmount). */
  dispose(): void;
}

export function createRefreshScheduler(): RefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    schedule(expiresAt: number, task: () => void | Promise<void>): void {
      if (disposed) return;
      clear();
      timer = setTimeout(() => {
        timer = null;
        void task();
      }, computeRefreshDelay(expiresAt));
    },
    clear,
    dispose(): void {
      disposed = true;
      clear();
    },
  };
}
