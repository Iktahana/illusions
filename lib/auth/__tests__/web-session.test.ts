/**
 * Tests for the web session adapter (#1437 refactor).
 *
 * Locks the permanent/transient failure classification of the httpOnly
 * cookie probe (`/api/auth/me/`): 401/403 are permanent, 5xx and network
 * errors are transient.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMe, webLogout } from "../web-session";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(impl: () => Promise<Response>): ReturnType<typeof vi.fn> {
  const fn = vi.fn(impl);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("fetchMe", () => {
  it("returns the session payload on success", async () => {
    const payload = {
      authenticated: true,
      user: { id: "u1", email: "a@b.c", name: "A", image: null, plan: "free" },
      expiresAt: 123,
    };
    const fn = mockFetch(async () => new Response(JSON.stringify(payload), { status: 200 }));

    const me = await fetchMe();
    expect(me).toEqual(payload);
    expect(fn).toHaveBeenCalledWith("/api/auth/me/", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it.each([401, 403])("classifies %d as a permanent failure", async (status) => {
    mockFetch(async () => new Response(null, { status }));
    expect(await fetchMe()).toEqual({ authenticated: false, permanent: true });
  });

  it.each([500, 502, 503])("classifies %d as a transient failure", async (status) => {
    mockFetch(async () => new Response(null, { status }));
    expect(await fetchMe()).toEqual({ authenticated: false, permanent: false });
  });

  it("classifies network errors as transient", async () => {
    mockFetch(async () => {
      throw new TypeError("network down");
    });
    expect(await fetchMe()).toEqual({ authenticated: false, permanent: false });
  });
});

describe("webLogout", () => {
  it("POSTs to the logout API route with same-origin credentials", async () => {
    const fn = mockFetch(async () => new Response(null, { status: 200 }));
    await webLogout();
    expect(fn).toHaveBeenCalledWith("/api/auth/logout/", {
      method: "POST",
      credentials: "same-origin",
    });
  });
});
