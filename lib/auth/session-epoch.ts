/**
 * Monotonic auth session epoch (#1437 / Codex review).
 *
 * Logout is the HARD session boundary: it bumps the epoch, and any in-flight
 * restore / refresh / OAuth-callback work that started under an older epoch
 * must discard its results instead of applying them — no setUser, no
 * re-persisted tokens, no rescheduled refresh timer. Module-level because the
 * persisted tokens are app-global state shared by every provider instance.
 *
 * The unmount guards (per-mount scheduler dispose + cancelled flags) fence
 * React state only; this epoch additionally fences adapter-side token
 * mutations, which must not outlive an explicit logout.
 */

let epoch = 0;

/** Current session epoch. Capture at the start of async auth work. */
export function getSessionEpoch(): number {
  return epoch;
}

/** Bump the epoch. Called on logout — invalidates all in-flight auth work. */
export function invalidateSessionEpoch(): number {
  epoch += 1;
  return epoch;
}

/** Thrown when in-flight auth work crosses a logout boundary. */
export class SessionInvalidatedError extends Error {
  constructor() {
    super("認証セッションはログアウトにより無効化されました");
    this.name = "SessionInvalidatedError";
  }
}

export function isSessionInvalidatedError(err: unknown): boolean {
  return err instanceof SessionInvalidatedError;
}
