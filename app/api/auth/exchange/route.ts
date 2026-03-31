import { NextResponse } from "next/server";
import { setAuthCookies, OAUTH_PROVIDER_URL, OAUTH_CLIENT_ID } from "@/lib/auth/auth-cookies";

interface ExchangeBody {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ExchangeBody;
  try {
    body = (await request.json()) as ExchangeBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { code, codeVerifier, redirectUri } = body;
  if (!code || !codeVerifier || !redirectUri) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const tokenRes = await fetch(`${OAUTH_PROVIDER_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: OAUTH_CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    return NextResponse.json(
      {
        error: (err as { error_description?: string }).error_description ?? "Token exchange failed",
      },
      { status: 401 },
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const response = NextResponse.json({ success: true });
  setAuthCookies(response, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });
  return response;
}
