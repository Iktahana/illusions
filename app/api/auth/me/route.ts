import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getAuthCookies,
  setAuthCookies,
  clearAuthCookies,
  OAUTH_PROVIDER_URL,
  OAUTH_CLIENT_ID,
} from "@/lib/auth/auth-cookies";

interface UserInfoResponse {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  plan: string;
}

/** Result of a token refresh attempt. */
type RefreshResult =
  | { ok: true; tokens: { access_token: string; refresh_token: string; expires_in: number } }
  | { ok: false; permanent: boolean };

/**
 * Returns whether an HTTP status code represents a permanent auth failure
 * (token invalid/revoked) vs a transient error (server unavailable, network issue).
 */
function isPermanentAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const res = await fetch(`${OAUTH_PROVIDER_URL}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: OAUTH_CLIENT_ID,
      }),
    });
    if (!res.ok) {
      return { ok: false, permanent: isPermanentAuthError(res.status) };
    }
    const tokens = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return { ok: true, tokens };
  } catch {
    // Network error — transient
    return { ok: false, permanent: false };
  }
}

/** Result of a userinfo fetch attempt. */
type UserInfoResult = { ok: true; userInfo: UserInfoResponse } | { ok: false; permanent: boolean };

async function fetchUserInfo(accessToken: string): Promise<UserInfoResult> {
  try {
    const res = await fetch(`${OAUTH_PROVIDER_URL}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return { ok: false, permanent: isPermanentAuthError(res.status) };
    }
    const userInfo = (await res.json()) as UserInfoResponse;
    return { ok: true, userInfo };
  } catch {
    // Network error — transient
    return { ok: false, permanent: false };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookies = getAuthCookies(request);
  if (!cookies) {
    // No session cookies — permanent (not authenticated)
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  let { accessToken } = cookies;
  const { refreshToken, expiresAt } = cookies;
  let tokensRefreshed = false;
  let newTokens: { access_token: string; refresh_token: string; expires_in: number } | null = null;

  // Refresh if expired
  if (Date.now() >= expiresAt) {
    const refreshResult = await refreshAccessToken(refreshToken);
    if (!refreshResult.ok) {
      if (refreshResult.permanent) {
        // Token is invalid/revoked — clear cookies and signal permanent logout
        const res = NextResponse.json({ authenticated: false }, { status: 401 });
        clearAuthCookies(res);
        return res;
      }
      // Transient error (5xx / network) — keep cookies, signal retry
      return NextResponse.json({ authenticated: false }, { status: 503 });
    }
    newTokens = refreshResult.tokens;
    accessToken = newTokens.access_token;
    tokensRefreshed = true;
  }

  // Fetch user info
  let userInfoResult = await fetchUserInfo(accessToken);

  // If userinfo fails with original token, try refreshing once
  if (!userInfoResult.ok && !tokensRefreshed) {
    const refreshResult = await refreshAccessToken(refreshToken);
    if (!refreshResult.ok) {
      if (refreshResult.permanent) {
        const res = NextResponse.json({ authenticated: false }, { status: 401 });
        clearAuthCookies(res);
        return res;
      }
      return NextResponse.json({ authenticated: false }, { status: 503 });
    }
    newTokens = refreshResult.tokens;
    accessToken = newTokens.access_token;
    tokensRefreshed = true;
    userInfoResult = await fetchUserInfo(accessToken);
  }

  if (!userInfoResult.ok) {
    if (userInfoResult.permanent) {
      // Permanent failure even after refresh — token is invalid
      const res = NextResponse.json({ authenticated: false }, { status: 401 });
      clearAuthCookies(res);
      return res;
    }
    // Transient — keep cookies, signal retry
    return NextResponse.json({ authenticated: false }, { status: 503 });
  }

  const { userInfo } = userInfoResult;
  const res = NextResponse.json({
    authenticated: true,
    user: {
      id: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      image: userInfo.picture,
      plan: userInfo.plan,
    },
    expiresAt: newTokens ? Date.now() + newTokens.expires_in * 1000 : expiresAt,
  });

  if (tokensRefreshed && newTokens) {
    setAuthCookies(res, {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      expiresIn: newTokens.expires_in,
    });
  }

  return res;
}
