/**
 * Regression tests for #1567 — async session restore had no unmount/cancel
 * guard: when `AuthProvider` unmounted while the Electron restore was still
 * in flight, the restore completed afterwards and scheduled a refresh timer
 * that nothing could ever clear.
 *
 * Drives the REAL `useAuthSession` hook via createRoot + act (repo pattern,
 * no @testing-library/react). Electron environment is simulated by mocking
 * `isElectronRenderer` and `window.electronAPI.auth`; token persistence is
 * mocked at the `token-storage` boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useAuthSession } from "../use-auth-session";
import type { AuthSessionState } from "../use-auth-session";
import type { StoredTokens } from "../token-storage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { loadTokensMock, saveTokensMock, clearTokensMock } = vi.hoisted(() => ({
  loadTokensMock: vi.fn<() => Promise<StoredTokens | null>>(async () => null),
  saveTokensMock: vi.fn(async () => undefined),
  clearTokensMock: vi.fn(async () => undefined),
}));

vi.mock("../token-storage", () => ({
  loadTokens: loadTokensMock,
  saveTokens: saveTokensMock,
  clearTokens: clearTokensMock,
}));

vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => true,
}));

const USER_INFO = {
  sub: "user-1",
  email: "user@example.com",
  name: "テストユーザー",
  picture: null,
  plan: "free",
  subscription_status: "active",
};

function installElectronAuthApi(): void {
  Object.defineProperty(window, "electronAPI", {
    value: {
      auth: {
        startLogin: vi.fn(async () => ({ state: "s" })),
        exchangeCode: vi.fn(),
        refreshToken: vi.fn(),
        getUserInfo: vi.fn(async () => USER_INFO),
        logout: vi.fn(async () => ({ success: true })),
        onCallback: vi.fn(() => () => undefined),
      },
    },
    configurable: true,
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const sessionRef: { current: AuthSessionState | null } = { current: null };

function Harness(): null {
  const session = useAuthSession();
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  sessionRef.current = null;
  installElectronAuthApi();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

function validTokens(): StoredTokens {
  return {
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: Date.now() + 60 * 60 * 1000, // healthy token, 1 hour left
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("#1567 — refresh timer lifecycle in useAuthSession", () => {
  it("does NOT schedule a refresh timer when restore resolves after unmount", async () => {
    // loadTokens stays pending until we resolve it manually.
    let resolveTokens: (tokens: StoredTokens) => void = () => undefined;
    loadTokensMock.mockImplementation(
      () =>
        new Promise<StoredTokens | null>((resolve) => {
          resolveTokens = resolve;
        }),
    );

    await act(async () => {
      root.render(<Harness />);
    });
    expect(loadTokensMock).toHaveBeenCalled();

    // Unmount while the startup restore is still in flight.
    await act(async () => {
      root.unmount();
    });

    // The restore now completes — after unmount.
    await act(async () => {
      resolveTokens(validTokens());
      await vi.advanceTimersByTimeAsync(0); // flush the restore promise chain
    });

    // Before the fix this left an uncancellable refresh timer behind.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("schedules a refresh timer on successful restore and clears it on unmount", async () => {
    loadTokensMock.mockImplementation(async () => validTokens());

    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(sessionRef.current?.user?.id).toBe("user-1");
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => {
      root.unmount();
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the refresh timer on logout", async () => {
    loadTokensMock.mockImplementation(async () => validTokens());

    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => {
      await sessionRef.current?.logout();
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(sessionRef.current?.user).toBeNull();
    expect(clearTokensMock).toHaveBeenCalled();
  });
});
