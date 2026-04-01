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

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  let res: Response;
  try {
    res = await fetch(`${OAUTH_PROVIDER_URL}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: OAUTH_CLIENT_ID,
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
  } catch {
    return null;
  }
}

async function fetchUserInfo(accessToken: string): Promise<UserInfoResponse | null> {
  let res: Response;
  try {
    res = await fetch(`${OAUTH_PROVIDER_URL}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return (await res.json()) as UserInfoResponse;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookies = getAuthCookies(request);
  if (!cookies) {
    return NextResponse.json({ authenticated: false });
  }

  let { accessToken } = cookies;
  const { refreshToken, expiresAt } = cookies;
  let tokensRefreshed = false;
  let newTokens: { access_token: string; refresh_token: string; expires_in: number } | null = null;

  // Refresh if expired
  if (Date.now() >= expiresAt) {
    newTokens = await refreshAccessToken(refreshToken);
    if (!newTokens) {
      const res = NextResponse.json({ authenticated: false });
      clearAuthCookies(res);
      return res;
    }
    accessToken = newTokens.access_token;
    tokensRefreshed = true;
  }

  // Fetch user info
  let userInfo = await fetchUserInfo(accessToken);

  // If userinfo fails with original token, try refreshing once
  if (!userInfo && !tokensRefreshed) {
    newTokens = await refreshAccessToken(refreshToken);
    if (!newTokens) {
      const res = NextResponse.json({ authenticated: false });
      clearAuthCookies(res);
      return res;
    }
    accessToken = newTokens.access_token;
    tokensRefreshed = true;
    userInfo = await fetchUserInfo(accessToken);
  }

  if (!userInfo) {
    const res = NextResponse.json({ authenticated: false });
    clearAuthCookies(res);
    return res;
  }

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
