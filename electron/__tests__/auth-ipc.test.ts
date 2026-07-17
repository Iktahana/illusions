import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(__dirname, "../ipc/auth-ipc.js"), "utf8");
const nodeRequire = createRequire(import.meta.url);
const electronId = nodeRequire.resolve("electron");
nodeRequire.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app: { on: () => {} },
    ipcMain: { handle: () => {} },
    shell: { openExternal: async () => {} },
    BrowserWindow: { getAllWindows: () => [], fromId: () => null, fromWebContents: () => null },
  },
} as unknown as NodeJS.Module;
const { isAllowedOAuthUrl } = nodeRequire("../ipc/auth-ipc.js") as {
  isAllowedOAuthUrl: (url: string) => boolean;
};

describe("auth-ipc.js — MAS in-app OAuth", () => {
  it("uses the app-wide MAS build flag and retains shell OAuth for other builds", () => {
    expect(source).toContain('require("../app-constants")');
    expect(source).toMatch(/if\s*\(isMasBuild\)[\s\S]*openMasAuthWindow/);
    expect(source).toMatch(/else\s*\{[\s\S]*shell\.openExternal\(authUrl\)/);
  });

  it("creates an isolated, sandboxed authorization window without a preload", () => {
    expect(source).toMatch(/contextIsolation:\s*true/);
    expect(source).toMatch(/nodeIntegration:\s*false/);
    expect(source).toMatch(/sandbox:\s*true/);
    expect(source).toContain('setWindowOpenHandler(() => ({ action: "deny" }))');
  });

  it("only permits the provider, expected IdPs, and the expected custom-scheme callback", () => {
    expect(source).toContain("parsed.origin === PROVIDER_URL");
    expect(source).toContain('parsed.protocol === "illusions:"');
    expect(source).toContain('parsed.host === "auth"');
    expect(source).toContain('parsed.pathname === "/callback"');
    expect(source).toContain("Blocked OAuth window navigation");
    expect(source).toContain('webContents.on("will-navigate", interceptNavigation)');
    expect(source).toContain('webContents.on("will-redirect", interceptNavigation)');
    expect(source).toContain("if (receivedCallback)");
  });

  it("allows only the hosted provider and known social-login origins", () => {
    expect(isAllowedOAuthUrl("https://my.illusions.app/api/oauth/authorize")).toBe(true);
    expect(isAllowedOAuthUrl("https://github.com/login/oauth/authorize")).toBe(true);
    expect(isAllowedOAuthUrl("https://accounts.google.com/o/oauth2/v2/auth")).toBe(true);
    expect(isAllowedOAuthUrl("https://appleid.apple.com/auth/authorize")).toBe(true);
    expect(isAllowedOAuthUrl("https://evil.example/redirect")).toBe(false);
    expect(isAllowedOAuthUrl("http://my.illusions.app/insecure")).toBe(false);
  });

  it("keeps MAS account deletion in a restricted in-app window", () => {
    expect(source).toContain("ACCOUNT_DELETION_URL = `${PROVIDER_URL}/delete-account`");
    expect(source).toContain("openMasAccountDeletionWindow");
    expect(source).toContain("AUTH_CHANNELS.invoke.openDeleteAccount");
    expect(source).toContain("Blocked account-deletion navigation");
    expect(source).toContain('webContents.on("will-redirect", interceptDeletionNavigation)');
  });

  it("cleans pending state when the auth window is cancelled or cannot load", () => {
    expect(source).toContain('authWindow.on("closed"');
    expect(source).toContain("pendingAuthByState.delete(state)");
    expect(source).toContain("Failed to load OAuth authorization page");
  });

  it("does not route callbacks with an unknown state to the focused window", () => {
    expect(source).toContain("Ignored OAuth callback with missing or invalid state");
    expect(source).not.toContain("BrowserWindow.getFocusedWindow()");
  });
});
