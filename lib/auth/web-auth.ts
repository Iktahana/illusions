/** Client-side OAuth PKCE utilities for the web version. */

const OAUTH_PROVIDER_URL = "https://my.illusions.app";
const OAUTH_CLIENT_ID = "illusions";
const PENDING_AUTH_KEY = "illusions:oauth_pending";

function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toBase64Url(digest);
}

/** Kick off the web OAuth login flow by redirecting to the provider. */
export async function startWebLogin(): Promise<void> {
  const state = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const redirectUri = `${window.location.origin}/auth/callback/`;

  sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify({ state, codeVerifier }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  window.location.href = `${OAUTH_PROVIDER_URL}/api/oauth/authorize?${params}`;
}

/** Read and consume the pending auth data stored before the redirect. */
export function consumePendingAuth(): { state: string; codeVerifier: string } | null {
  const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_AUTH_KEY);
  try {
    return JSON.parse(raw) as { state: string; codeVerifier: string };
  } catch {
    return null;
  }
}
