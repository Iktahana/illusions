import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: vi.fn(() => []) },
}));
vi.mock("../../../lib/storage/electron-storage-manager", () => ({
  ElectronStorageManager: vi.fn(),
}));

type AppStateHandler = (
  event: { sender: unknown },
  updates: unknown,
) => Promise<Record<string, unknown>>;

async function createHandler(options?: {
  trusted?: boolean;
  existing?: Record<string, unknown> | null;
}) {
  const { createUpdateAppStateHandler } = await import("../storage-ipc.js");
  const manager = {
    loadAppState: vi.fn().mockResolvedValue(options?.existing ?? { fontScale: 1 }),
    saveAppState: vi.fn().mockResolvedValue(undefined),
  };
  const broadcast = vi.fn();
  const handler = createUpdateAppStateHandler({
    manager,
    isTrustedRenderer: () => options?.trusted !== false,
    broadcast,
  }) as AppStateHandler;
  return { handler, manager, broadcast };
}

describe("storage:update-app-state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges in main, persists, returns and broadcasts one canonical snapshot", async () => {
    const { handler, manager, broadcast } = await createHandler({
      existing: { fontScale: 1, compactMode: false },
    });

    await expect(handler({ sender: {} }, { compactMode: true })).resolves.toEqual({
      fontScale: 1,
      compactMode: true,
    });
    expect(manager.saveAppState).toHaveBeenCalledWith({ fontScale: 1, compactMode: true });
    expect(broadcast).toHaveBeenCalledWith({ fontScale: 1, compactMode: true });
  });

  it("serializes competing patches so neither update is lost", async () => {
    const { handler, manager } = await createHandler({ existing: {} });
    let persisted: Record<string, unknown> = { fontScale: 1 };
    let releaseFirstLoad: (() => void) | undefined;
    manager.loadAppState
      .mockImplementationOnce(
        () => new Promise((resolve) => (releaseFirstLoad = () => resolve(persisted))),
      )
      .mockImplementation(() => Promise.resolve(persisted));
    manager.saveAppState.mockImplementation((next: Record<string, unknown>) => {
      persisted = next;
      return Promise.resolve();
    });

    const first = handler({ sender: {} }, { compactMode: true });
    const second = handler({ sender: {} }, { lineHeight: 1.5 });
    await Promise.resolve();
    releaseFirstLoad?.();

    await expect(first).resolves.toEqual({ fontScale: 1, compactMode: true });
    await expect(second).resolves.toEqual({ fontScale: 1, compactMode: true, lineHeight: 1.5 });
    expect(manager.saveAppState.mock.calls).toEqual([
      [{ fontScale: 1, compactMode: true }],
      [{ fontScale: 1, compactMode: true, lineHeight: 1.5 }],
    ]);
  });

  it("rejects an untrusted sender before reading or writing state", async () => {
    const { handler, manager, broadcast } = await createHandler({ trusted: false });

    await expect(handler({ sender: {} }, { compactMode: true })).rejects.toThrow(/Unauthorized/);
    expect(manager.loadAppState).not.toHaveBeenCalled();
    expect(manager.saveAppState).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("rejects non-object patches before reading or writing state", async () => {
    const { handler, manager } = await createHandler();

    await expect(handler({ sender: {} }, [])).rejects.toThrow(/expected object/);
    expect(manager.loadAppState).not.toHaveBeenCalled();
    expect(manager.saveAppState).not.toHaveBeenCalled();
  });
});
