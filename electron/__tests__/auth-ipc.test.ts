import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const source = fs.readFileSync(path.resolve(__dirname, "../ipc/auth-ipc.js"), "utf8");
const nodeRequire = createRequire(import.meta.url);
const electronId = nodeRequire.resolve("electron");
const authHandlers = new Map<string, (event: { sender: unknown }) => Promise<unknown>>();
const startMacOSAuthSession = vi.fn<
  (url: string, scheme: string, requestId: string) => Promise<string>
>(() => new Promise<string>(() => {}));
const cancelMacOSAuthSession = vi.fn();
const cancelAllMacOSAuthSessionsForShutdown = vi.fn();
const electronMock: {
  app: { on: () => void; once: () => void };
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: unknown }) => Promise<unknown>) => void;
  };
  shell: { openExternal: (url: string) => Promise<void> };
  BrowserWindow: {
    getAllWindows: () => unknown[];
    fromId: () => unknown;
    fromWebContents: () => unknown;
  };
} = {
  app: { on: () => {}, once: () => {} },
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: unknown }) => Promise<unknown>) => {
      authHandlers.set(channel, handler);
    },
  },
  shell: { openExternal: async () => {} },
  BrowserWindow: { getAllWindows: () => [], fromId: () => null, fromWebContents: () => null },
};
nodeRequire.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: electronMock,
} as unknown as NodeJS.Module;
const macosAuthSessionId = nodeRequire.resolve("../lib/macos-auth-session.js");
nodeRequire.cache[macosAuthSessionId] = {
  id: macosAuthSessionId,
  filename: macosAuthSessionId,
  loaded: true,
  exports: { startMacOSAuthSession, cancelMacOSAuthSession, cancelAllMacOSAuthSessionsForShutdown },
} as unknown as NodeJS.Module;
const authIpc = nodeRequire("../ipc/auth-ipc.js") as {
  registerAuthHandlers: () => void;
  handleAuthCallback: (url: string) => void;
};

describe("auth-ipc.js — platform OAuth routing", () => {
  it("loads without the removed embedded OAuth helpers", () => {
    expect(authIpc.registerAuthHandlers).toBeTypeOf("function");
    expect(authIpc.handleAuthCallback).toBeTypeOf("function");
  });

  it("uses ASWebAuthenticationSession on macOS without an embedded OAuth BrowserWindow", () => {
    expect(source).toContain('require("../lib/macos-auth-session")');
    expect(source).toContain('if (process.platform === "darwin")');
    expect(source).toContain('startMacOSAuthSession(authUrl, "illusions", state)');
    expect(source).toContain("handleAuthCallback(callbackUrl)");
    expect(source).not.toContain("openMasAuthWindow");
    expect(source).not.toContain("setWindowOpenHandler(({ url })");
  });

  it("retains system-browser OAuth as the non-macOS path and the macOS fallback", () => {
    expect(source).toContain("ASWebAuthenticationSession unavailable; opening system browser");
    expect(source).toContain("await shell.openExternal(authUrl)");
  });

  it("cancels the matching native session on window close and all sessions before quit", () => {
    expect(source).toContain("cancelMacOSAuthSession(state)");
    expect(source).toContain('app.once("before-quit"');
    expect(source).toContain("cancelAllMacOSAuthSessionsForShutdown()");
  });

  it("cancels the request that belongs to a closed source window", async () => {
    let onClosed: (() => void) | undefined;
    const sourceWindow = {
      id: 41,
      on: vi.fn((event: string, listener: () => void) => {
        if (event === "closed") onClosed = listener;
      }),
    };
    electronMock.BrowserWindow.getAllWindows = () => [sourceWindow];
    electronMock.BrowserWindow.fromWebContents = () => sourceWindow;
    authHandlers.clear();
    startMacOSAuthSession.mockClear();
    cancelMacOSAuthSession.mockClear();

    authIpc.registerAuthHandlers();
    const startLogin = authHandlers.get("auth:start-login");
    expect(startLogin).toBeDefined();
    await startLogin?.({ sender: {} });

    const requestId = startMacOSAuthSession.mock.calls[0]?.[2];
    expect(requestId).toEqual(expect.any(String));
    onClosed?.();
    expect(cancelMacOSAuthSession).toHaveBeenCalledWith(requestId);
  });

  it("keeps MAS account deletion in a restricted app-owned window", () => {
    expect(source).toContain("ACCOUNT_DELETION_URL = `${PROVIDER_URL}/delete-account`");
    expect(source).toContain("openMasAccountDeletionWindow");
    expect(source).toContain("AUTH_CHANNELS.invoke.openDeleteAccount");
    expect(source).toContain("Blocked account-deletion navigation");
  });

  it("does not route callbacks with an unknown state to the focused window", () => {
    expect(source).toContain("Ignored OAuth callback with missing or invalid state");
    expect(source).not.toContain("BrowserWindow.getFocusedWindow()");
  });
});
