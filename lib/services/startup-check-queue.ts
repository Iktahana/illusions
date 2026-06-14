/**
 * Startup check queue
 *
 * A small, generic registry of "things to verify when the app starts" that may
 * surface a toast to the user (e.g. "dictionary not downloaded", "update
 * available"). New startup notices are expected to grow over time, so each one
 * is a {@link StartupCheck} registered here instead of being wired ad-hoc into
 * the boot sequence.
 *
 * The queue runs once per app start (see `useStartupChecks`). Each check is
 * evaluated against the *current* state every run, so notices keep reappearing
 * until the underlying condition is resolved — no dismissed-state persistence.
 */
import { notificationManager } from "./notification-manager";
import type { NotificationType, NotificationAction } from "@/types/notification";

export interface StartupNotice {
  /** Stable key for the notice (for logging / future de-dup). */
  id: string;
  type: NotificationType;
  message: string;
  actions?: NotificationAction[];
  /** ms before auto-close; 0 keeps it until manually dismissed. */
  duration?: number;
}

export interface StartupCheck {
  id: string;
  /**
   * Return a notice when the condition is met, or null to stay silent.
   * Implementations MUST NOT throw for expected "nothing to do" cases; any
   * thrown error is isolated by the queue so one failing check never blocks the
   * others or the app boot.
   */
  evaluate: () => Promise<StartupNotice | null>;
}

export class StartupCheckQueue {
  private readonly checks = new Map<string, StartupCheck>();

  /** Register a check. Re-registering the same id replaces the previous one. */
  register(check: StartupCheck): void {
    this.checks.set(check.id, check);
  }

  /** Evaluate every registered check in registration order and surface notices. */
  async run(): Promise<void> {
    for (const check of this.checks.values()) {
      try {
        const notice = await check.evaluate();
        if (!notice) continue;
        notificationManager.showMessage(notice.message, {
          type: notice.type,
          duration: notice.duration,
          actions: notice.actions,
        });
      } catch (error) {
        // Never let a single check break startup.
        console.warn(`[startup-check] "${check.id}" failed:`, error);
      }
    }
  }
}

/** Process-wide singleton (lib/services convention). */
export const startupCheckQueue = new StartupCheckQueue();
