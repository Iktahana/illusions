/**
 * Single-flight dedupe + permanent-failure guard for the Electron auth refresh
 * IPC (`auth:refresh-token`).
 *
 * ## Why this exists
 *
 * `AuthProvider` invokes `api.auth.refreshToken()` from three independent call
 * sites (the scheduled-refresh timer, and the two startup restore paths). Under
 * React StrictMode double-mount and Next.js fast-refresh, the provider remounts
 * and several of these paths can fire concurrently, each issuing its own IPC for
 * the *same* refresh token.
 *
 * A module-scope boolean guard (the v1.2.5 approach in the rolled-back PR #1444)
 * was insufficient: the guard only flips *after* the first IPC resolves, so the
 * parallel callers that started before resolution all slipped past it — the
 * `invalid_grant` error still appeared three times in the startup log.
 *
 * The robust fix is caller-side **single-flight**: concurrent refresh requests
 * share one in-flight Promise, so the IPC is issued at most once per refresh
 * cycle regardless of how many callers race. A separate **permanent-failure**
 * latch short-circuits all subsequent calls once the refresh token is known to
 * be revoked/expired (per RFC 6749 §5.2 a 4xx / `invalid_grant` cannot recover
 * within the session), avoiding repeated doomed IPCs.
 *
 * State is module-scope (not React state/ref) so it survives StrictMode remounts
 * and is shared across every call site within the renderer session. Reset it on
 * login success, OAuth callback success, and logout via {@link resetRefreshState}.
 */

/** Token endpoint response shape (mirrors `window.electronAPI.auth.refreshToken`). */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/** A refresh function — typically `window.electronAPI.auth.refreshToken`. */
export type RefreshTokenFn = (refreshToken: string) => Promise<TokenResponse>;

/**
 * Thrown by {@link refreshTokenSingleFlight} when a refresh is attempted after
 * the session has already hit a permanent failure. Recognised as permanent by
 * {@link isElectronAuthErrorPermanent}, so existing callers log out as expected.
 */
export class PermanentAuthFailureError extends Error {
  constructor(message = "refresh token は永続的に失敗済みのため再試行しません") {
    super(message);
    this.name = "PermanentAuthFailureError";
  }
}

/**
 * Returns whether an error thrown by the Electron auth IPC represents a
 * permanent auth failure (token invalid/revoked) vs a transient error
 * (server unavailable, network issue).
 *
 * The IPC handlers attach `error.status` (HTTP status) and, for the OAuth
 * token endpoint, `error.oauthError` (e.g. `invalid_grant`).
 *
 * Per RFC 6749 §5.2, the token endpoint returns HTTP 400 for client errors
 * such as `invalid_grant` (refresh token expired/revoked). Retrying these
 * cannot succeed, so any 4xx from the auth endpoints must be treated as
 * permanent — otherwise the renderer falls into a tight refresh loop on
 * a revoked token.
 */
export function isElectronAuthErrorPermanent(err: unknown): boolean {
  if (err instanceof PermanentAuthFailureError) return true;
  if (!(err instanceof Error)) return false;

  const oauthError = (err as Error & { oauthError?: unknown }).oauthError;
  if (
    oauthError === "invalid_grant" ||
    oauthError === "invalid_client" ||
    oauthError === "unauthorized_client" ||
    oauthError === "unsupported_grant_type"
  ) {
    return true;
  }

  if ("status" in err) {
    const status = (err as Error & { status: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) return true;
  }
  // No status attached (network/IPC error) — treat as transient
  return false;
}

// --- Module-scope single-flight state (per renderer session) ---
let inFlightRefresh: Promise<TokenResponse> | null = null;
let refreshPermanentlyFailedSession = false;

/**
 * Refresh the access token, deduping concurrent callers into a single IPC and
 * short-circuiting once the session has permanently failed.
 *
 * - If a prior refresh permanently failed, rejects immediately with
 *   {@link PermanentAuthFailureError} without touching the IPC.
 * - If a refresh is already in flight, returns that same Promise.
 * - Otherwise issues `fn(refreshToken)`, latching the permanent-failure flag on
 *   a permanent error, and clears the in-flight slot once settled.
 */
export function refreshTokenSingleFlight(
  fn: RefreshTokenFn,
  refreshToken: string,
): Promise<TokenResponse> {
  if (refreshPermanentlyFailedSession) {
    return Promise.reject(new PermanentAuthFailureError());
  }
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  const promise = (async () => {
    try {
      return await fn(refreshToken);
    } catch (err) {
      if (isElectronAuthErrorPermanent(err)) {
        refreshPermanentlyFailedSession = true;
      }
      throw err;
    } finally {
      inFlightRefresh = null;
    }
  })();

  inFlightRefresh = promise;
  return promise;
}

/**
 * Clear the single-flight and permanent-failure state. Call on login success,
 * OAuth callback success, and logout so a fresh token can refresh normally.
 */
export function resetRefreshState(): void {
  inFlightRefresh = null;
  refreshPermanentlyFailedSession = false;
}

/** Test-only inspector for the permanent-failure latch. */
export function isRefreshPermanentlyFailed(): boolean {
  return refreshPermanentlyFailedSession;
}
