/**
 * Drift-prevention tests for the IPC bridge registry (#1434).
 *
 * Three guarantees for the migrated namespaces (storage, dict):
 * 1. Channel string values are pinned — the renderer/main contract must never
 *    change silently (backward compatibility with existing callers).
 * 2. Every channel the preload bridge uses is registered on the main-process
 *    side through the SAME shared constant (string-level check of the
 *    modules), so preload and ipcMain.handle cannot drift apart.
 * 3. The bridge helpers preserve the hand-written wrapper semantics:
 *    invoke arg forwarding / payload mapping, and unsubscribe removing only
 *    its own listener.
 */

import fs from "fs";
import path from "path";
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const { STORAGE_CHANNELS, DICT_CHANNELS } = require("../../../electron/lib/ipc-channels") as {
  STORAGE_CHANNELS: {
    invoke: Record<string, string>;
    event: Record<string, string>;
  };
  DICT_CHANNELS: {
    invoke: Record<string, string>;
    event: Record<string, string>;
  };
};

const { createIpcBridge } = require("../../../electron/lib/ipc-bridge") as {
  createIpcBridge: (renderer: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, handler: (...args: unknown[]) => void) => void;
    removeListener: (channel: string, handler: (...args: unknown[]) => void) => void;
  }) => {
    invokeChannel: (
      channel: string,
      shape?: ((...args: unknown[]) => unknown) | { arity: number },
    ) => (...args: unknown[]) => Promise<unknown>;
    eventChannel: (channel: string) => (callback: (payload: unknown) => void) => () => void;
  };
};

const electronDir = path.resolve(__dirname, "../..");
const readSource = (relPath: string): string =>
  fs.readFileSync(path.join(electronDir, relPath), "utf8");

describe("ipc-channels: pinned channel names (public IPC contract)", () => {
  it("storage invoke channels keep their historical string values", () => {
    expect(STORAGE_CHANNELS.invoke).toEqual({
      saveSession: "storage:save-session",
      loadSession: "storage:load-session",
      saveAppState: "storage:save-app-state",
      loadAppState: "storage:load-app-state",
      addToRecent: "storage:add-to-recent",
      getRecentFiles: "storage:get-recent-files",
      removeFromRecent: "storage:remove-from-recent",
      clearRecent: "storage:clear-recent",
      saveEditorBuffer: "storage:save-editor-buffer",
      loadEditorBuffer: "storage:load-editor-buffer",
      clearEditorBuffer: "storage:clear-editor-buffer",
      clearAll: "storage:clear-all",
      addRecentProject: "storage:add-recent-project",
      getRecentProjects: "storage:get-recent-projects",
      removeRecentProject: "storage:remove-recent-project",
      setItem: "storage:set-item",
      getItem: "storage:get-item",
      removeItem: "storage:remove-item",
    });
    expect(STORAGE_CHANNELS.event).toEqual({});
  });

  it("dict invoke/event channels keep their historical string values", () => {
    expect(DICT_CHANNELS.invoke).toEqual({
      query: "dict:query",
      queryReading: "dict:query-reading",
      getStatus: "dict:get-status",
      checkUpdate: "dict:check-update",
      download: "dict:download",
    });
    expect(DICT_CHANNELS.event).toEqual({
      downloadProgress: "dict:download-progress",
      updateAvailable: "dict:update-available",
    });
  });
});

describe("ipc bridge: preload ↔ main handler registration cannot drift", () => {
  const preloadSrc = readSource("preload.js");
  const storageIpcSrc = readSource("ipc/storage-ipc.js");
  const dictIpcSrc = readSource("ipc/dict-ipc.js");
  const mainSrc = readSource("main.js");

  it("every storage invoke channel used by preload is registered via the shared constant", () => {
    for (const key of Object.keys(STORAGE_CHANNELS.invoke)) {
      // preload bridges the channel…
      expect(preloadSrc).toContain(`STORAGE_CHANNELS.invoke.${key}`);
      // …and main registers a handler for the same constant
      expect(storageIpcSrc).toContain(`ipcMain.handle(STORAGE_CHANNELS.invoke.${key},`);
    }
  });

  it("every dict invoke channel used by preload is registered via the shared constant", () => {
    for (const key of Object.keys(DICT_CHANNELS.invoke)) {
      expect(preloadSrc).toContain(`DICT_CHANNELS.invoke.${key}`);
      expect(dictIpcSrc).toContain(`ipcMain.handle(DICT_CHANNELS.invoke.${key},`);
    }
  });

  it("every dict event channel subscribed in preload has a main-process sender using the shared constant", () => {
    expect(preloadSrc).toContain("DICT_CHANNELS.event.downloadProgress");
    expect(dictIpcSrc).toContain("event.sender.send(DICT_CHANNELS.event.downloadProgress,");
    expect(preloadSrc).toContain("DICT_CHANNELS.event.updateAvailable");
    expect(mainSrc).toContain("webContents.send(DICT_CHANNELS.event.updateAvailable,");
  });

  it("preload no longer hard-codes storage/dict channel string literals", () => {
    // "safe-storage:*" channels are a different (unmigrated) namespace and
    // are not matched by these patterns.
    expect(preloadSrc).not.toMatch(/["']storage:/);
    expect(preloadSrc).not.toMatch(/["']dict:/);
  });
});

describe("ipc-bridge helpers: behavior parity with the hand-written wrappers", () => {
  function makeFakeRenderer() {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    return {
      invoke: vi.fn((..._args: unknown[]) => Promise.resolve("ok")),
      on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
        listeners.set(channel, [...(listeners.get(channel) ?? []), handler]);
      }),
      removeListener: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
        listeners.set(
          channel,
          (listeners.get(channel) ?? []).filter((h) => h !== handler),
        );
      }),
      emit(channel: string, ...args: unknown[]) {
        for (const handler of listeners.get(channel) ?? []) {
          handler({ fake: "event" }, ...args);
        }
      },
      listenerCount(channel: string) {
        return (listeners.get(channel) ?? []).length;
      },
    };
  }

  it("invokeChannel forwards exactly `arity` arguments and drops extras (least authority)", async () => {
    const renderer = makeFakeRenderer();
    const { invokeChannel } = createIpcBridge(renderer);
    const setItem = invokeChannel("storage:set-item", { arity: 2 });
    await expect(setItem("key", { a: 1 })).resolves.toBe("ok");
    expect(renderer.invoke).toHaveBeenCalledWith("storage:set-item", "key", { a: 1 });

    // Extra renderer-supplied arguments never cross the IPC boundary —
    // matching the legacy fixed-arity hand-written wrappers (Codex review).
    await setItem("key", { a: 1 }, "unexpected-extra");
    expect(renderer.invoke).toHaveBeenLastCalledWith("storage:set-item", "key", { a: 1 });
  });

  it("invokeChannel without arity forwards nothing (zero-arg channels)", async () => {
    const renderer = makeFakeRenderer();
    const { invokeChannel } = createIpcBridge(renderer);
    const loadSession = invokeChannel("storage:load-session", { arity: 0 });
    await loadSession("stray-argument");
    expect(renderer.invoke).toHaveBeenCalledWith("storage:load-session");
  });

  it("invokeChannel with mapArgs reshapes positional args into the payload object", async () => {
    const renderer = makeFakeRenderer();
    const { invokeChannel } = createIpcBridge(renderer);
    const query = invokeChannel(
      "dict:query",
      (term: unknown, limit: unknown) => ({ term, limit }) as unknown,
    );
    await query("猫", 5);
    expect(renderer.invoke).toHaveBeenCalledWith("dict:query", { term: "猫", limit: 5 });
  });

  it("eventChannel strips the IpcRendererEvent and passes the payload to the callback", () => {
    const renderer = makeFakeRenderer();
    const { eventChannel } = createIpcBridge(renderer);
    const onProgress = eventChannel("dict:download-progress");
    const received: unknown[] = [];
    onProgress((payload) => received.push(payload));
    renderer.emit("dict:download-progress", { progress: 42 });
    expect(received).toEqual([{ progress: 42 }]);
  });

  it("eventChannel unsubscribe removes only its own handler (no removeAllListeners)", () => {
    const renderer = makeFakeRenderer();
    const { eventChannel } = createIpcBridge(renderer);
    const subscribe = eventChannel("dict:update-available");
    const a: unknown[] = [];
    const b: unknown[] = [];
    const unsubscribeA = subscribe((payload) => a.push(payload));
    subscribe((payload) => b.push(payload));
    expect(renderer.listenerCount("dict:update-available")).toBe(2);

    unsubscribeA();
    expect(renderer.listenerCount("dict:update-available")).toBe(1);

    renderer.emit("dict:update-available", { latestVersion: "1.2.3" });
    expect(a).toEqual([]);
    expect(b).toEqual([{ latestVersion: "1.2.3" }]);
  });
});
