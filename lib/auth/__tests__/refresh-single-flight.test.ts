import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isElectronAuthErrorPermanent,
  PermanentAuthFailureError,
  refreshTokenSingleFlight,
  resetRefreshState,
  isRefreshPermanentlyFailed,
  type TokenResponse,
} from "@/lib/auth/refresh-single-flight";

function makeTokenResponse(overrides: Partial<TokenResponse> = {}): TokenResponse {
  return {
    access_token: "access",
    refresh_token: "refresh-next",
    expires_in: 3600,
    token_type: "Bearer",
    scope: "openid",
    ...overrides,
  };
}

/** Build an Error carrying the fields the IPC layer attaches. */
function authError(opts: { status?: number; oauthError?: string; message?: string }): Error {
  const err = new Error(opts.message ?? "auth error") as Error & {
    status?: number;
    oauthError?: string;
  };
  if (opts.status !== undefined) err.status = opts.status;
  if (opts.oauthError !== undefined) err.oauthError = opts.oauthError;
  return err;
}

afterEach(() => {
  resetRefreshState();
});

describe("refreshTokenSingleFlight", () => {
  it("dedupes concurrent callers into a single IPC (the #1468 regression)", async () => {
    let resolveFn: (value: TokenResponse) => void = () => {};
    const fn = vi.fn().mockImplementation(
      () =>
        new Promise<TokenResponse>((resolve) => {
          resolveFn = resolve;
        }),
    );

    // Three callers race before the first IPC resolves (StrictMode double-mount
    // + parallel restore). They must share one in-flight Promise.
    const p1 = refreshTokenSingleFlight(fn, "refresh-token");
    const p2 = refreshTokenSingleFlight(fn, "refresh-token");
    const p3 = refreshTokenSingleFlight(fn, "refresh-token");

    expect(fn).toHaveBeenCalledTimes(1);

    const response = makeTokenResponse();
    resolveFn(response);
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([response, response, response]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("issues a fresh IPC after the previous refresh settled", async () => {
    const fn = vi.fn().mockResolvedValue(makeTokenResponse());

    await refreshTokenSingleFlight(fn, "rt-1");
    await refreshTokenSingleFlight(fn, "rt-2");

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("latches permanent failure and short-circuits without calling the IPC again", async () => {
    const fn = vi.fn().mockRejectedValue(authError({ status: 400, oauthError: "invalid_grant" }));

    await expect(refreshTokenSingleFlight(fn, "revoked")).rejects.toThrow();
    expect(isRefreshPermanentlyFailed()).toBe(true);

    // Subsequent calls reject with PermanentAuthFailureError and never hit the IPC.
    await expect(refreshTokenSingleFlight(fn, "revoked")).rejects.toBeInstanceOf(
      PermanentAuthFailureError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT latch on transient failure — retries reach the IPC", async () => {
    const fn = vi.fn().mockRejectedValue(authError({ status: 503 }));

    await expect(refreshTokenSingleFlight(fn, "rt")).rejects.toThrow();
    expect(isRefreshPermanentlyFailed()).toBe(false);

    await expect(refreshTokenSingleFlight(fn, "rt")).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("resetRefreshState clears the permanent-failure latch (login/logout)", async () => {
    const failing = vi.fn().mockRejectedValue(authError({ oauthError: "invalid_grant" }));
    await expect(refreshTokenSingleFlight(failing, "revoked")).rejects.toThrow();
    expect(isRefreshPermanentlyFailed()).toBe(true);

    resetRefreshState();
    expect(isRefreshPermanentlyFailed()).toBe(false);

    const ok = vi.fn().mockResolvedValue(makeTokenResponse());
    await expect(refreshTokenSingleFlight(ok, "fresh")).resolves.toEqual(makeTokenResponse());
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe("isElectronAuthErrorPermanent", () => {
  it("treats 4xx as permanent and 5xx / network as transient", () => {
    expect(isElectronAuthErrorPermanent(authError({ status: 400 }))).toBe(true);
    expect(isElectronAuthErrorPermanent(authError({ status: 403 }))).toBe(true);
    expect(isElectronAuthErrorPermanent(authError({ status: 500 }))).toBe(false);
    expect(isElectronAuthErrorPermanent(authError({}))).toBe(false);
    expect(isElectronAuthErrorPermanent("not-an-error")).toBe(false);
  });

  it("treats OAuth client errors as permanent", () => {
    expect(isElectronAuthErrorPermanent(authError({ oauthError: "invalid_grant" }))).toBe(true);
    expect(isElectronAuthErrorPermanent(authError({ oauthError: "invalid_client" }))).toBe(true);
  });

  it("recognises PermanentAuthFailureError", () => {
    expect(isElectronAuthErrorPermanent(new PermanentAuthFailureError())).toBe(true);
  });
});
