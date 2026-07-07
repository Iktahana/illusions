import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadShellPathPolicy(): Promise<typeof import("../../lib/shell-path-policy.js")> {
  vi.resetModules();
  return import("../../lib/shell-path-policy.js");
}

describe("shell-ipc path validation", () => {
  const senderId = 42;
  const home = os.homedir();
  const root = path.join(home, "illusions-shell-test-project");
  const rootReal = path.join(home, "illusions-shell-test-project-real");
  const allowedFile = path.join(root, "assets", "cover.pdf");
  const allowedFileReal = path.join(rootReal, "assets", "cover.pdf");
  const outsideFile = path.join(home, "outside.pdf");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function deps(overrides: Record<string, unknown> = {}) {
    return {
      getVfsRoot: vi.fn(() => ({ path: root, realPath: rootReal })),
      resolveRealPath: vi.fn(async (p: string) =>
        p === allowedFile ? allowedFileReal : p.replace(root, rootReal),
      ),
      stat: vi.fn(async () => ({ isFile: () => true })),
      ...overrides,
    };
  }

  it("rejects renderer-provided absolute paths when the window has no approved VFS root", async () => {
    const { validateShellPathForSender } = await loadShellPathPolicy();

    const result = await validateShellPathForSender(allowedFile, senderId, {
      ...deps(),
      getVfsRoot: vi.fn(() => null),
    });

    expect(result).toBeNull();
  });

  it("allows a non-executable path inside the approved VFS root", async () => {
    const { validateShellPathForSender } = await loadShellPathPolicy();

    const result = await validateShellPathForSender(allowedFile, senderId, deps());

    expect(result).toBe(path.resolve(allowedFile));
  });

  it("allows the approved VFS root itself so Show in File Manager still works", async () => {
    const { validateShellPathForSender } = await loadShellPathPolicy();

    const result = await validateShellPathForSender(root, senderId, {
      ...deps(),
      resolveRealPath: vi.fn(async () => rootReal),
    });

    expect(result).toBe(path.resolve(root));
  });

  it("rejects paths outside the approved VFS root", async () => {
    const { validateShellPathForSender } = await loadShellPathPolicy();

    const result = await validateShellPathForSender(outsideFile, senderId, deps());

    expect(result).toBeNull();
  });

  it("rejects symlink-resolved paths that escape the approved real root", async () => {
    const { validateShellPathForSender } = await loadShellPathPolicy();

    const result = await validateShellPathForSender(allowedFile, senderId, {
      ...deps(),
      resolveRealPath: vi.fn(async () => outsideFile),
    });

    expect(result).toBeNull();
  });

  it("rejects executable targets even when they are under the approved root", async () => {
    const { validateShellPathForSender } = await loadShellPathPolicy();
    const appPath = path.join(root, "Tools", "Helper.app");

    const result = await validateShellPathForSender(appPath, senderId, {
      ...deps(),
      resolveRealPath: vi.fn(async () => path.join(rootReal, "Tools", "Helper.app")),
    });

    expect(result).toBeNull();
  });

  it("openWithDefaultApp handler does not call shell.openPath for rejected paths", async () => {
    const { createOpenPathHandler } = await loadShellPathPolicy();
    const openPath = vi.fn(async () => "");
    const handler = createOpenPathHandler(openPath, {
      ...deps(),
      getVfsRoot: vi.fn(() => null),
    });

    const result = await handler({ sender: { id: senderId } }, allowedFile);

    expect(result).toBe(false);
    expect(openPath).not.toHaveBeenCalled();
  });

  it("openWithDefaultApp handler opens validated paths", async () => {
    const { createOpenPathHandler } = await loadShellPathPolicy();
    const openPath = vi.fn(async () => "");
    const handler = createOpenPathHandler(openPath, deps());

    const result = await handler({ sender: { id: senderId } }, allowedFile);

    expect(result).toBe(true);
    expect(openPath).toHaveBeenCalledWith(path.resolve(allowedFile));
  });
});
