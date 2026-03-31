import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const COOKIE_ACCESS_TOKEN = "illusions:access_token";
const COOKIE_REFRESH_TOKEN = "illusions:refresh_token";
const COOKIE_EXPIRES_AT = "illusions:expires_at";

const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export const OAUTH_PROVIDER_URL = "https://my.illusions.app";
export const OAUTH_CLIENT_ID = "illusions";

interface TokenPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function cookieOptions(): { httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string } {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export function setAuthCookies(response: NextResponse, tokens: TokenPayload): void {
  const opts = cookieOptions();
  const expiresAt = Date.now() + tokens.expiresIn * 1000;

  response.cookies.set(COOKIE_ACCESS_TOKEN, tokens.accessToken, {
    ...opts,
    maxAge: tokens.expiresIn,
  });
  response.cookies.set(COOKIE_REFRESH_TOKEN, tokens.refreshToken, {
    ...opts,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
  response.cookies.set(COOKIE_EXPIRES_AT, String(expiresAt), {
    ...opts,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

export interface AuthCookies {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export function getAuthCookies(request: NextRequest): AuthCookies | null {
  const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
  const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;
  const expiresAtRaw = request.cookies.get(COOKIE_EXPIRES_AT)?.value;
  if (!accessToken || !refreshToken || !expiresAtRaw) return null;
  return { accessToken, refreshToken, expiresAt: Number(expiresAtRaw) };
}

export function clearAuthCookies(response: NextResponse): void {
  const opts = cookieOptions();
  for (const name of [COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN, COOKIE_EXPIRES_AT]) {
    response.cookies.set(name, "", { ...opts, maxAge: 0 });
  }
}
