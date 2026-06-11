/**
 * Web session adapter (httpOnly cookie flow via Next.js API routes).
 *
 * The browser never sees tokens directly: the session lives in httpOnly
 * cookies and is probed/refreshed through `/api/auth/me/`. Logout clears the
 * cookies via `/api/auth/logout/`.
 */

import type { AuthUser } from "./auth-user";

export interface MeResponse {
  authenticated: boolean;
  user?: AuthUser;
  expiresAt?: number;
  /**
   * Indicates whether the auth failure is permanent (token invalid/revoked)
   * or transient (network error, server unavailable).
   * Only meaningful when authenticated === false.
   */
  permanent?: boolean;
}

export async function fetchMe(): Promise<MeResponse> {
  try {
    const res = await fetch("/api/auth/me/", {
      method: "POST",
      credentials: "same-origin",
    });
    if (res.ok) {
      return (await res.json()) as MeResponse;
    }
    // 401/403 = permanent (token invalid or no session)
    // 5xx = transient (server error)
    const permanent = res.status === 401 || res.status === 403;
    return { authenticated: false, permanent };
  } catch {
    // Network error — transient
    return { authenticated: false, permanent: false };
  }
}

export async function webLogout(): Promise<void> {
  await fetch("/api/auth/logout/", { method: "POST", credentials: "same-origin" });
}
