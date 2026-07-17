import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Module from "module";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { VFS_CHANNELS } = require("../../../electron/lib/ipc-channels") as {
  VFS_CHANNELS: {
    invoke: { openDirectory: string; writeFile: string; delete: string; rename: string };
  };
};

type Handler = (event: { sender: { id: number } }, ...args: unknown[]) => Promise<unknown>;

interface Harness {
  handlers: Map<string, Handler>;
  fsMock: {
    realpath: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    stat: ReturnType<typeof vi.fn>;
    rm: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
  };
  fileHandle: {
    writeFile: ReturnType<typeof vi.fn>;
    sync: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  dialogMock: {
    showOpenDialog: ReturnType<typeof vi.fn>;
  };
}

let restoreModuleLoad: (() => void) | null = null;

type ModuleLoad = (
  request: string,
  parent: NodeJS.Module | null | undefined,
  isMain: boolean,
) => unknown;

const moduleWithLoad = Module as typeof Module & { _load: ModuleLoad };

function purgeVfsIpcModules() {
  for (const id of [
    "../../../electron/ipc/vfs-ipc.js",
    "../../../electron/lib/vfs-approvals.js",
    "../../../electron/lib/security-scoped-access.js",
  ]) {
    const resolved = require.resolve(id);
    delete require.cache[resolved];
  }
}

const isWin32 = process.platform === "win32";
const nativeRoot = isWin32 ? "C:\\Users\\me\\Novel" : "/Users/me/Novel";
const nativeFile = isWin32
  ? "C:\\Users\\me\\Novel\\Drafts\\chapter1.mdi"
  : "/Users/me/Novel/Drafts/chapter1.mdi";
const nativeOutsideFile = isWin32
  ? "C:\\Users\\me\\Other\\chapter1.mdi"
  : "/Users/me/Other/chapter1.mdi";
const nativeExpectedFile = isWin32
  ? /^C:\/Users\/me\/Novel\/Drafts\/chapter1\.mdi$/i
  : "/Users/me/Novel/Drafts/chapter1.mdi";

function installHarness(rootPath = nativeRoot): Harness {
  purgeVfsIpcModules();

  const handlers = new Map<string, Handler>();
  const fileHandle = {
    writeFile: vi.fn(async () => {}),
    sync: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const fsMock = {
    realpath: vi.fn(async (p: string) => p),
    open: vi.fn(async () => fileHandle),
    stat: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    lstat: vi.fn(),
  };
  const dialogMock = {
    showOpenDialog: vi.fn(async () => ({
      canceled: false,
      filePaths: [rootPath],
      bookmarks: [],
    })),
  };
  const appMock = {
    getPath: vi.fn(() =>
      isWin32
        ? "C:\\Users\\me\\AppData\\Roaming\\illusions"
        : "/Users/me/Library/Application Support/illusions",
    ),
    on: vi.fn(),
  };
  const electronMock = {
    ipcMain: {
      handle: vi.fn((channel: string, handler: Handler) => {
        handlers.set(channel, handler);
      }),
    },
    dialog: dialogMock,
    app: appMock,
    BrowserWindow: { fromWebContents: vi.fn(() => null) },
    webContents: { fromId: vi.fn(() => ({ isDestroyed: () => false })) },
  };

  const originalLoad = moduleWithLoad._load;
  moduleWithLoad._load = ((
    request: string,
    parent: NodeJS.Module | null | undefined,
    isMain: boolean,
  ) => {
    if (request === "electron") return electronMock;
    if (request === "fs/promises") return fsMock;
    return originalLoad(request, parent, isMain);
  }) as ModuleLoad;

  restoreModuleLoad = () => {
    moduleWithLoad._load = originalLoad;
    restoreModuleLoad = null;
  };

  const { registerVFSHandlers } = require("../../../electron/ipc/vfs-ipc.js") as {
    registerVFSHandlers: () => void;
  };
  registerVFSHandlers();

  return { handlers, fsMock, fileHandle, dialogMock };
}

async function openRoot(harness: Harness, senderId = 101) {
  const handler = harness.handlers.get(VFS_CHANNELS.invoke.openDirectory);
  if (!handler) throw new Error("openDirectory handler was not registered");
  await handler({ sender: { id: senderId } });
}

async function writeFile(harness: Harness, filePath: string, content: unknown, senderId = 101) {
  const handler = harness.handlers.get(VFS_CHANNELS.invoke.writeFile);
  if (!handler) throw new Error("writeFile handler was not registered");
  return handler({ sender: { id: senderId } }, filePath, content);
}

async function deleteEntry(harness: Harness, filePath: string, senderId = 101) {
  const handler = harness.handlers.get(VFS_CHANNELS.invoke.delete);
  if (!handler) throw new Error("delete handler was not registered");
  return handler({ sender: { id: senderId } }, filePath);
}

async function renameEntry(harness: Harness, oldPath: string, newPath: string, senderId = 101) {
  const handler = harness.handlers.get(VFS_CHANNELS.invoke.rename);
  if (!handler) throw new Error("rename handler was not registered");
  return handler({ sender: { id: senderId } }, oldPath, newPath);
}

function codedError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

describe("vfs-ipc writeFile handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreModuleLoad?.();
    purgeVfsIpcModules();
  });

  it("writes with open -> writeFile -> sync -> close after root validation", async () => {
    const harness = installHarness();
    await openRoot(harness);

    await writeFile(harness, nativeFile, "content");

    expect(harness.fsMock.open).toHaveBeenCalledWith(
      typeof nativeExpectedFile === "string"
        ? nativeExpectedFile
        : expect.stringMatching(nativeExpectedFile),
      "w",
    );
    expect(harness.fileHandle.writeFile).toHaveBeenCalledWith("content", "utf-8");
    expect(harness.fileHandle.sync).toHaveBeenCalledOnce();
    expect(harness.fileHandle.close).toHaveBeenCalledOnce();
    expect(harness.fileHandle.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      harness.fileHandle.sync.mock.invocationCallOrder[0],
    );
    expect(harness.fileHandle.sync.mock.invocationCallOrder[0]).toBeLessThan(
      harness.fileHandle.close.mock.invocationCallOrder[0],
    );
  });

  it("still closes the file handle when the write fails", async () => {
    const harness = installHarness();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    harness.fileHandle.writeFile.mockRejectedValueOnce(new Error("disk full"));
    await openRoot(harness);

    await expect(writeFile(harness, nativeFile, "content")).rejects.toThrow("disk full");

    expect(harness.fileHandle.sync).not.toHaveBeenCalled();
    expect(harness.fileHandle.close).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("rejects non-string content before touching disk", async () => {
    const harness = installHarness();
    await openRoot(harness);

    await expect(writeFile(harness, nativeFile, new Uint8Array([1]))).rejects.toThrow(
      "Invalid content",
    );

    expect(harness.fsMock.open).not.toHaveBeenCalled();
  });

  it("rejects paths outside the approved root before opening the file", async () => {
    const harness = installHarness();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await openRoot(harness);

    await expect(writeFile(harness, nativeOutsideFile, "content")).rejects.toThrow(
      "プロジェクトディレクトリの外部",
    );

    expect(harness.fsMock.open).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it.runIf(isWin32)("preserves UNC root validation and write path semantics", async () => {
    const harness = installHarness("\\\\server\\share\\Novel");
    await openRoot(harness);

    await writeFile(harness, "\\\\server\\share\\Novel\\chapter1.mdi", "content");

    expect(harness.fsMock.open).toHaveBeenCalledWith("//server/share/Novel/chapter1.mdi", "w");
  });

  it("retries delete after a transient Windows file-lock error", async () => {
    const harness = installHarness();
    harness.fsMock.stat.mockResolvedValue({ isDirectory: () => false });
    harness.fsMock.unlink
      .mockRejectedValueOnce(codedError("EPERM"))
      .mockResolvedValueOnce(undefined);
    await openRoot(harness);

    await deleteEntry(harness, nativeFile);

    expect(harness.fsMock.unlink).toHaveBeenCalledTimes(2);
  });

  it("retries rename after a transient Windows file-lock error", async () => {
    const harness = installHarness();
    harness.fsMock.rename
      .mockRejectedValueOnce(codedError("EBUSY"))
      .mockResolvedValueOnce(undefined);
    await openRoot(harness);

    await renameEntry(harness, nativeFile, nativeFile.replace("chapter1.mdi", "chapter2.mdi"));

    expect(harness.fsMock.rename).toHaveBeenCalledTimes(2);
  });
});
