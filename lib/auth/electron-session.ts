/**
 * Electron session adapter.
 *
 * Builds on the Electron persistence adapter (`token-storage.ts`, safeStorage
 * with in-memory session fallback) and the single-flight refresh guard
 * (`refresh-single-flight.ts`) to provide the three session-level operations
 * the auth provider needs: token refresh, startup restore, and OAuth callback
 * completion. Permanent vs transient failure classification is unchanged:
 * permanent failures (4xx / invalid_grant) clear the persisted tokens,
 * transient failures (5xx / network) leave them in place.
 */

import {
  isElectronAuthErrorPermanent,
  refreshTokenSingleFlight,
  resetRefreshState,
} from "./refresh-single-flight";
import {
  getSessionEpoch,
  isSessionInvalidatedError,
  SessionInvalidatedError,
} from "./session-epoch";
import { clearTokens, loadTokens, saveTokens } from "./token-storage";
import { toAuthUser } from "./auth-user";
import type { AuthUser } from "./auth-user";
import type { StoredTokens } from "./token-storage";

/** The Electron auth IPC surface exposed by the preload script. */
export type ElectronAuthApi = NonNullable<ElectronAPI["auth"]>;

export interface ElectronSession {
  user: AuthUser;
  expiresAt: number;
  refreshToken: string;
}

export function getElectronAuthApi(): ElectronAuthApi | null {
  return window.electronAPI?.auth ?? null;
}

/**
 * Persist rotated tokens, fenced by the session epoch (#1437 Codex review):
 * if logout invalidated the session while the network call was in flight, the
 * rotated tokens must NOT be re-persisted — and if logout's clearTokens()
 * interleaved with our saveTokens(), a compensating clear runs so rotated
 * tokens never outlive the logout. Throws SessionInvalidatedError when fenced.
 */
async function persistSessionTokens(tokens: StoredTokens, sessionEpoch?: number): Promise<void> {
  if (sessionEpoch !== undefined && getSessionEpoch() !== sessionEpoch) {
    throw new SessionInvalidatedError();
  }
  await saveTokens(tokens);
  if (sessionEpoch !== undefined && getSessionEpoch() !== sessionEpoch) {
    await clearTokens();
    throw new SessionInvalidatedError();
  }
}

/**
 * Refresh the access token (single-flight), persist the rotated tokens via
 * the Electron persistence adapter, and fetch the user profile.
 * Pass `sessionEpoch` (captured before the call) so a logout that happens
 * mid-refresh discards the result instead of re-persisting tokens.
 */
export async function refreshElectronSession(
  authApi: ElectronAuthApi,
  refreshToken: string,
  sessionEpoch?: number,
): Promise<ElectronSession> {
  const tokenResponse = await refreshTokenSingleFlight(authApi.refreshToken, refreshToken);
  const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
  await persistSessionTokens(
    {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt,
    },
    sessionEpoch,
  );

  const userInfo = await authApi.getUserInfo(tokenResponse.access_token);
  return { user: toAuthUser(userInfo), expiresAt, refreshToken: tokenResponse.refresh_token };
}

/**
 * Refresh helper for the startup paths: on permanent failures (401/403,
 * invalid_grant) the stored tokens are cleared; transient errors leave the
 * tokens in place so a later launch can retry.
 */
async function refreshOrClear(
  authApi: ElectronAuthApi,
  refreshToken: string,
  sessionEpoch?: number,
): Promise<ElectronSession | null> {
  try {
    return await refreshElectronSession(authApi, refreshToken, sessionEpoch);
  } catch (err) {
    // Logout fenced the refresh — tokens are already handled, just bail out.
    if (isSessionInvalidatedError(err)) return null;
    if (isElectronAuthErrorPermanent(err)) {
      await clearTokens();
    }
    return null;
  }
}

/**
 * Startup restore: load persisted tokens, validate or refresh them, and
 * return the restored session (or null when there is no usable session).
 */
export async function restoreElectronSession(
  sessionEpoch?: number,
): Promise<ElectronSession | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;

  const authApi = getElectronAuthApi();
  if (!authApi) return null;

  const { accessToken, refreshToken, expiresAt } = tokens;

  if (Date.now() >= expiresAt) {
    // Access token expired — refresh before trusting it.
    return refreshOrClear(authApi, refreshToken, sessionEpoch);
  }

  try {
    const userInfo = await authApi.getUserInfo(accessToken);
    return { user: toAuthUser(userInfo), expiresAt, refreshToken };
  } catch {
    // Access token rejected despite local expiry saying otherwise — refresh.
    return refreshOrClear(authApi, refreshToken, sessionEpoch);
  }
}

/**
 * Complete the OAuth callback: exchange the authorization code, reset the
 * single-flight permanent-failure latch (fresh tokens from a successful login
 * must refresh normally), persist the tokens, and fetch the user profile.
 */
export async function completeElectronOAuthCallback(
  authApi: ElectronAuthApi,
  params: { code: string; state: string },
  sessionEpoch?: number,
): Promise<ElectronSession> {
  const tokenResponse = await authApi.exchangeCode(params);

  // Fresh tokens from a successful login clear any prior permanent-failure
  // latch so the new session can refresh normally.
  resetRefreshState();

  const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
  await persistSessionTokens(
    {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt,
    },
    sessionEpoch,
  );

  const userInfo = await authApi.getUserInfo(tokenResponse.access_token);
  return { user: toAuthUser(userInfo), expiresAt, refreshToken: tokenResponse.refresh_token };
}
