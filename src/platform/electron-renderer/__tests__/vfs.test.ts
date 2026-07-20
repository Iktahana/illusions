import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElectronVFS } from "@/platform/electron-renderer/vfs";

function installBridge() {
  const bridge = {
    openDirectory: vi.fn(),
    openFile: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(async () => {}),
    readDirectory: vi.fn(),
    stat: vi.fn(),
    exists: vi.fn(),
    mkdir: vi.fn(async () => {}),
    delete: vi.fn(),
    rename: vi.fn(async () => {}),
    setRoot: vi.fn(async () => {}),
  };

  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: { vfs: bridge },
  });

  return bridge;
}

describe("ElectronVFS", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("writes relative paths through mkdir(parent) then writeFile(absolute)", async () => {
    const bridge = installBridge();
    const vfs = new ElectronVFS();
    await vfs.setRootPath("C:\\Users\\me\\Novel");

    await vfs.writeFile("Drafts\\chapter1.mdi", "content");

    expect(bridge.mkdir).toHaveBeenCalledWith("C:/Users/me/Novel/Drafts");
    expect(bridge.writeFile).toHaveBeenCalledWith(
      "C:/Users/me/Novel/Drafts/chapter1.mdi",
      "content",
    );
    expect(bridge.mkdir.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.writeFile.mock.invocationCallOrder[0],
    );
  });

  it("does not join Windows drive-letter absolute paths to the opened root", async () => {
    const bridge = installBridge();
    const vfs = new ElectronVFS();
    await vfs.setRootPath("C:\\Users\\me\\Novel");

    await vfs.writeFile("D:\\Other\\chapter.mdi", "drive content");

    expect(bridge.mkdir).toHaveBeenCalledWith("D:/Other");
    expect(bridge.writeFile).toHaveBeenCalledWith("D:/Other/chapter.mdi", "drive content");
  });

  it("does not join UNC absolute paths to the opened root", async () => {
    const bridge = installBridge();
    const vfs = new ElectronVFS();
    await vfs.setRootPath("C:\\Users\\me\\Novel");

    await vfs.writeFile("\\\\server\\share\\Novel\\chapter.mdi", "unc content");

    expect(bridge.mkdir).toHaveBeenCalledWith("//server/share/Novel");
    expect(bridge.writeFile).toHaveBeenCalledWith(
      "//server/share/Novel/chapter.mdi",
      "unc content",
    );
  });

  it("renames relative paths after resolving both sides against the root", async () => {
    const bridge = installBridge();
    const vfs = new ElectronVFS();
    await vfs.setRootPath("C:\\Users\\me\\Novel");

    await vfs.rename("Drafts\\old.mdi", "Drafts\\new.mdi");

    expect(bridge.rename).toHaveBeenCalledWith(
      "C:/Users/me/Novel/Drafts/old.mdi",
      "C:/Users/me/Novel/Drafts/new.mdi",
    );
  });

  it("throws before writing a relative path when no root is open", async () => {
    const bridge = installBridge();
    const vfs = new ElectronVFS();

    await expect(vfs.writeFile("chapter.mdi", "content")).rejects.toThrow(
      "Cannot resolve relative path",
    );
    expect(bridge.writeFile).not.toHaveBeenCalled();
  });

  it("creates a missing file handle by checking exists then issuing an empty write", async () => {
    const bridge = installBridge();
    bridge.exists.mockResolvedValue(false);
    const vfs = new ElectronVFS();
    await vfs.setRootPath("C:\\Users\\me\\Novel");

    const root = await vfs.getDirectoryHandle("");
    const handle = await root.getFileHandle("new.mdi", { create: true });

    expect(bridge.exists).toHaveBeenCalledWith("C:/Users/me/Novel/new.mdi");
    expect(bridge.writeFile).toHaveBeenCalledWith("C:/Users/me/Novel/new.mdi", "");
    await handle.write("later");
    expect(bridge.writeFile).toHaveBeenLastCalledWith("C:/Users/me/Novel/new.mdi", "later");
  });
});
