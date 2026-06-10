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
import { clearTokens, loadTokens, saveTokens } from "./token-storage";
import { toAuthUser } from "./auth-user";
import type { AuthUser } from "./auth-user";

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
 * Refresh the access token (single-flight), persist the rotated tokens via
 * the Electron persistence adapter, and fetch the user profile.
 */
export async function refreshElectronSession(
  authApi: ElectronAuthApi,
  refreshToken: string,
): Promise<ElectronSession> {
  const tokenResponse = await refreshTokenSingleFlight(authApi.refreshToken, refreshToken);
  const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
  await saveTokens({
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt,
  });

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
): Promise<ElectronSession | null> {
  try {
    return await refreshElectronSession(authApi, refreshToken);
  } catch (err) {
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
export async function restoreElectronSession(): Promise<ElectronSession | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;

  const authApi = getElectronAuthApi();
  if (!authApi) return null;

  const { accessToken, refreshToken, expiresAt } = tokens;

  if (Date.now() >= expiresAt) {
    // Access token expired — refresh before trusting it.
    return refreshOrClear(authApi, refreshToken);
  }

  try {
    const userInfo = await authApi.getUserInfo(accessToken);
    return { user: toAuthUser(userInfo), expiresAt, refreshToken };
  } catch {
    // Access token rejected despite local expiry saying otherwise — refresh.
    return refreshOrClear(authApi, refreshToken);
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
): Promise<ElectronSession> {
  const tokenResponse = await authApi.exchangeCode(params);

  // Fresh tokens from a successful login clear any prior permanent-failure
  // latch so the new session can refresh normally.
  resetRefreshState();

  const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
  await saveTokens({
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt,
  });

  const userInfo = await authApi.getUserInfo(tokenResponse.access_token);
  return { user: toAuthUser(userInfo), expiresAt, refreshToken: tokenResponse.refresh_token };
}
