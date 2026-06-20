/**
 * Drift-prevention tests for the IPC bridge registry (#1434).
 *
 * Three guarantees, now covering ALL namespaces (Phase 2):
 * 1. Channel string values are pinned — the renderer/main contract must never
 *    change silently (backward compatibility with existing callers).
 * 2. Every channel the preload bridge uses is registered on the main-process
 *    side through the SAME shared constant (string-level check of the
 *    modules), so preload and ipcMain.handle/on cannot drift apart.
 *    Exception: MENU event channels are dispatched data-driven from
 *    lib/menu/menu-template.js (`electronChannel` literals shared with the
 *    Next.js renderer); for those, the literal value itself is pinned.
 * 3. The bridge helpers preserve the hand-written wrapper semantics:
 *    invoke/send arg forwarding / payload mapping, event callback arity,
 *    and unsubscribe removing only its own listener.
 */

import fs from "fs";
import path from "path";
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

type ChannelGroup = {
  invoke: Record<string, string>;
  send?: Record<string, string>;
  event: Record<string, string>;
};

const channels = require("../../../electron/lib/ipc-channels") as Record<string, ChannelGroup>;
const {
  STORAGE_CHANNELS,
  DICT_CHANNELS,
  FILE_CHANNELS,
  EXPORT_CHANNELS,
  SHELL_CHANNELS,
  SYSTEM_CHANNELS,
  MENU_CHANNELS,
  VFS_CHANNELS,
  AUTH_CHANNELS,
  SAFE_STORAGE_CHANNELS,
  POWER_CHANNELS,
  EDITOR_CHANNELS,
  NLP_CHANNELS,
  PTY_CHANNELS,
  RULESETS_CHANNELS,
} = channels;

const { createIpcBridge } = require("../../../electron/lib/ipc-bridge") as {
  createIpcBridge: (renderer: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    send: (channel: string, ...args: unknown[]) => void;
    on: (channel: string, handler: (...args: unknown[]) => void) => void;
    removeListener: (channel: string, handler: (...args: unknown[]) => void) => void;
  }) => {
    invokeChannel: (
      channel: string,
      shape?: ((...args: unknown[]) => unknown) | { arity: number },
    ) => (...args: unknown[]) => Promise<unknown>;
    sendChannel: (
      channel: string,
      shape?: ((...args: unknown[]) => unknown) | { arity: number },
    ) => (...args: unknown[]) => void;
    eventChannel: (
      channel: string,
      shape?: { arity: number },
    ) => (callback: (...payload: unknown[]) => void) => () => void;
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
      getKeysByPrefix: "storage:get-keys-by-prefix",
    });
    expect(STORAGE_CHANNELS.event).toEqual({});
  });

  it("dict invoke/event channels keep their historical string values", () => {
    expect(DICT_CHANNELS.invoke).toEqual({
      query: "dict:query",
      queryReading: "dict:query-reading",
      lookupBatch: "dict:lookup-batch",
      verify: "dict:verify",
      getStatus: "dict:get-status",
      checkUpdate: "dict:check-update",
      download: "dict:download",
    });
    expect(DICT_CHANNELS.event).toEqual({
      downloadProgress: "dict:download-progress",
      updateAvailable: "dict:update-available",
    });
  });

  it("file invoke/event channels keep their historical string values", () => {
    expect(FILE_CHANNELS.invoke).toEqual({
      openFile: "open-file",
      saveFile: "save-file",
      getPendingFile: "get-pending-file",
    });
    expect(FILE_CHANNELS.event).toEqual({
      openFileFromSystem: "open-file-from-system",
      openAsProject: "open-as-project",
    });
  });

  it("export invoke channels keep their historical string values", () => {
    expect(EXPORT_CHANNELS.invoke).toEqual({
      generatePdfPreview: "generate-pdf-preview",
      exportPdf: "export-pdf",
      exportEpub: "export-epub",
      exportDocx: "export-docx",
      printDocument: "print-document",
    });
    expect(EXPORT_CHANNELS.event).toEqual({});
  });

  it("shell invoke channels keep their historical string values", () => {
    expect(SHELL_CHANNELS.invoke).toEqual({
      showInFileManager: "show-in-file-manager",
      revealInFileManager: "reveal-in-file-manager",
      openWithDefaultApp: "open-with-default-app",
      openExternal: "open-external",
      openDictionaryPopup: "open-dictionary-popup",
      showContextMenu: "show-context-menu",
    });
    expect(SHELL_CHANNELS.event).toEqual({});
  });

  it("system invoke/event channels keep their historical string values", () => {
    expect(SYSTEM_CHANNELS.invoke).toEqual({
      getChromeVersion: "get-chrome-version",
      setDirty: "set-dirty",
      saveBeforeCloseDone: "save-before-close-done",
      newWindow: "new-window",
    });
    expect(SYSTEM_CHANNELS.send).toEqual({
      // #1839: renderer → main close-aborted signal
      closeAborted: "close-aborted",
    });
    expect(SYSTEM_CHANNELS.event).toEqual({
      requestSaveBeforeClose: "electron-request-save-before-close",
      requestFlushStateBeforeClose: "electron-request-flush-state-before-close",
    });
  });

  it("menu invoke/event channels keep their historical string values", () => {
    expect(MENU_CHANNELS.invoke).toEqual({
      rebuild: "menu:rebuild",
      syncUiState: "menu:sync-ui-state",
      updateKeymapOverrides: "menu:update-keymap-overrides",
    });
    expect(MENU_CHANNELS.event).toEqual({
      newTriggered: "menu-new-triggered",
      openTriggered: "menu-open-triggered",
      saveTriggered: "menu-save-triggered",
      saveAsTriggered: "menu-save-as-triggered",
      closeTab: "menu-close-tab",
      newTab: "menu-new-tab",
      pasteAsPlaintext: "menu-paste-as-plaintext",
      openProject: "menu-open-project",
      openRecentProject: "menu-open-recent-project",
      showInFileManager: "menu-show-in-file-manager",
      toggleCompactMode: "menu-toggle-compact-mode",
      format: "menu-format",
      theme: "menu-theme",
      print: "menu-print",
      exportTxt: "menu-export-txt",
      exportTxtRuby: "menu-export-txt-ruby",
      exportPdf: "menu-export-pdf",
      exportEpub: "menu-export-epub",
      exportDocx: "menu-export-docx",
    });
  });

  it("vfs invoke channels keep their historical string values", () => {
    expect(VFS_CHANNELS.invoke).toEqual({
      openDirectory: "vfs:open-directory",
      openFile: "vfs:open-file",
      setRoot: "vfs:set-root",
      readFile: "vfs:read-file",
      writeFile: "vfs:write-file",
      readDirectory: "vfs:read-directory",
      stat: "vfs:stat",
      exists: "vfs:exists",
      mkdir: "vfs:mkdir",
      delete: "vfs:delete",
      rename: "vfs:rename",
      indexLockAcquire: "vfs:index-lock:acquire",
      indexLockRelease: "vfs:index-lock:release",
    });
    expect(VFS_CHANNELS.event).toEqual({});
  });

  it("auth invoke/event channels keep their historical string values", () => {
    expect(AUTH_CHANNELS.invoke).toEqual({
      startLogin: "auth:start-login",
      exchangeCode: "auth:exchange-code",
      refreshToken: "auth:refresh-token",
      getUserInfo: "auth:get-userinfo",
      logout: "auth:logout",
    });
    expect(AUTH_CHANNELS.event).toEqual({
      callback: "auth:callback",
    });
  });

  it("safe-storage invoke channels keep their historical string values", () => {
    expect(SAFE_STORAGE_CHANNELS.invoke).toEqual({
      encrypt: "safe-storage:encrypt",
      decrypt: "safe-storage:decrypt",
      isAvailable: "safe-storage:is-available",
    });
    expect(SAFE_STORAGE_CHANNELS.event).toEqual({});
  });

  it("power invoke/event channels keep their historical string values", () => {
    expect(POWER_CHANNELS.invoke).toEqual({
      getState: "power:get-state",
    });
    expect(POWER_CHANNELS.event).toEqual({
      stateChanged: "power:state-changed",
      // #1841: suspend/resume/lock-screen power events
      resumed: "power:resumed",
      suspended: "power:suspended",
      lockScreen: "power:lock-screen",
    });
  });

  it("editor invoke/send/event channels keep their historical string values", () => {
    expect(EDITOR_CHANNELS.invoke).toEqual({
      popoutPanel: "editor:popout-panel",
    });
    expect(EDITOR_CHANNELS.send).toEqual({
      bufferSync: "editor:buffer-sync",
      bufferClose: "editor:buffer-close",
    });
    expect(EDITOR_CHANNELS.event).toEqual({
      bufferSyncBroadcast: "editor:buffer-sync-broadcast",
      bufferCloseBroadcast: "editor:buffer-close-broadcast",
    });
  });

  it("nlp invoke/event channels keep their historical string values", () => {
    expect(NLP_CHANNELS.invoke).toEqual({
      init: "nlp:init",
      tokenizeParagraph: "nlp:tokenize-paragraph",
      tokenizeDocument: "nlp:tokenize-document",
      analyzeWordFrequency: "nlp:analyze-word-frequency",
    });
    expect(NLP_CHANNELS.event).toEqual({
      tokenizeProgress: "nlp:tokenize-progress",
    });
  });

  it("pty invoke/event channels keep their historical string values", () => {
    expect(PTY_CHANNELS.invoke).toEqual({
      spawn: "pty:spawn",
      attach: "pty:attach",
      write: "pty:write",
      resize: "pty:resize",
      kill: "pty:kill",
      status: "pty:status",
    });
    expect(PTY_CHANNELS.event).toEqual({
      data: "pty:data",
      exit: "pty:exit",
    });
  });

  it("rulesets invoke channels keep their historical string values", () => {
    expect(RULESETS_CHANNELS.invoke).toEqual({
      listInstalled: "rulesets:list-installed",
      sync: "rulesets:sync",
      checkUpdate: "rulesets:check-update",
      readModule: "rulesets:read-module",
      uninstall: "rulesets:uninstall",
    });
    expect(RULESETS_CHANNELS.event).toEqual({
      syncProgress: "rulesets:sync-progress",
      changed: "rulesets:changed",
    });
  });
});

describe("ipc bridge: preload ↔ main handler registration cannot drift", () => {
  const preloadSrc = readSource("preload.js");

  /**
   * Registration matrix: for every namespace, the main-process source file
   * that must register each invoke (ipcMain.handle) / send (ipcMain.on)
   * channel via the SAME shared constant the preload bridge uses.
   */
  const invokeRegistrations: Array<{
    constName: string;
    group: ChannelGroup;
    mainFile: string;
    /** invoke keys handled in a different file than `mainFile` */
    overrides?: Record<string, string>;
  }> = [
    { constName: "STORAGE_CHANNELS", group: STORAGE_CHANNELS, mainFile: "ipc/storage-ipc.js" },
    { constName: "DICT_CHANNELS", group: DICT_CHANNELS, mainFile: "ipc/dict-ipc.js" },
    { constName: "FILE_CHANNELS", group: FILE_CHANNELS, mainFile: "ipc/file-ipc.js" },
    { constName: "EXPORT_CHANNELS", group: EXPORT_CHANNELS, mainFile: "ipc/file-ipc.js" },
    { constName: "SHELL_CHANNELS", group: SHELL_CHANNELS, mainFile: "ipc/shell-ipc.js" },
    { constName: "SYSTEM_CHANNELS", group: SYSTEM_CHANNELS, mainFile: "ipc/system-ipc.js" },
    { constName: "MENU_CHANNELS", group: MENU_CHANNELS, mainFile: "ipc/system-ipc.js" },
    { constName: "VFS_CHANNELS", group: VFS_CHANNELS, mainFile: "ipc/vfs-ipc.js" },
    { constName: "AUTH_CHANNELS", group: AUTH_CHANNELS, mainFile: "ipc/auth-ipc.js" },
    {
      constName: "SAFE_STORAGE_CHANNELS",
      group: SAFE_STORAGE_CHANNELS,
      mainFile: "ipc/system-ipc.js",
    },
    { constName: "POWER_CHANNELS", group: POWER_CHANNELS, mainFile: "ipc/system-ipc.js" },
    { constName: "EDITOR_CHANNELS", group: EDITOR_CHANNELS, mainFile: "ipc/editor-ipc.js" },
    { constName: "NLP_CHANNELS", group: NLP_CHANNELS, mainFile: "ipc/nlp-ipc.js" },
    { constName: "PTY_CHANNELS", group: PTY_CHANNELS, mainFile: "ipc/pty-ipc.js" },
    { constName: "RULESETS_CHANNELS", group: RULESETS_CHANNELS, mainFile: "ipc/rulesets-ipc.js" },
  ];

  it.each(invokeRegistrations)(
    "$constName: every invoke channel bridged in preload is registered via ipcMain.handle($constName.invoke.*)",
    ({ constName, group, mainFile }) => {
      const mainSrc = readSource(mainFile);
      for (const key of Object.keys(group.invoke)) {
        // preload bridges the channel…
        expect(preloadSrc).toContain(`${constName}.invoke.${key}`);
        // …and main registers a handler for the same constant
        // (multi-line call sites collapse to "constant," after the paren)
        expect(mainSrc.replace(/\(\s+/g, "(")).toContain(
          `ipcMain.handle(${constName}.invoke.${key},`,
        );
      }
    },
  );

  it("editor send channels (fire-and-forget) are received via ipcMain.on with the shared constant", () => {
    const editorIpcSrc = readSource("ipc/editor-ipc.js");
    for (const key of Object.keys(EDITOR_CHANNELS.send ?? {})) {
      expect(preloadSrc).toContain(`EDITOR_CHANNELS.send.${key}`);
      expect(editorIpcSrc).toContain(`ipcMain.on(EDITOR_CHANNELS.send.${key},`);
    }
  });

  /**
   * Event (main → renderer push) channels: each subscribed constant in
   * preload must have a main-process sender referencing the same constant.
   */
  const eventSenders: Array<{ constName: string; key: string; senderFile: string }> = [
    { constName: "DICT_CHANNELS", key: "downloadProgress", senderFile: "ipc/dict-ipc.js" },
    { constName: "DICT_CHANNELS", key: "updateAvailable", senderFile: "main.js" },
    { constName: "FILE_CHANNELS", key: "openFileFromSystem", senderFile: "ipc/file-ipc.js" },
    { constName: "FILE_CHANNELS", key: "openAsProject", senderFile: "ipc/file-ipc.js" },
    {
      constName: "SYSTEM_CHANNELS",
      key: "requestSaveBeforeClose",
      senderFile: "window-manager.js",
    },
    {
      constName: "SYSTEM_CHANNELS",
      key: "requestFlushStateBeforeClose",
      senderFile: "window-manager.js",
    },
    { constName: "AUTH_CHANNELS", key: "callback", senderFile: "ipc/auth-ipc.js" },
    { constName: "POWER_CHANNELS", key: "stateChanged", senderFile: "window-manager.js" },
    { constName: "EDITOR_CHANNELS", key: "bufferSyncBroadcast", senderFile: "ipc/editor-ipc.js" },
    { constName: "EDITOR_CHANNELS", key: "bufferCloseBroadcast", senderFile: "ipc/editor-ipc.js" },
    { constName: "NLP_CHANNELS", key: "tokenizeProgress", senderFile: "ipc/nlp-ipc.js" },
    { constName: "PTY_CHANNELS", key: "data", senderFile: "ipc/pty-ipc.js" },
    { constName: "PTY_CHANNELS", key: "exit", senderFile: "ipc/pty-ipc.js" },
    { constName: "RULESETS_CHANNELS", key: "syncProgress", senderFile: "ipc/rulesets-ipc.js" },
    { constName: "RULESETS_CHANNELS", key: "changed", senderFile: "ipc/rulesets-ipc.js" },
  ];

  it.each(eventSenders)(
    "$constName event $key: preload subscribes and $senderFile sends via the shared constant",
    ({ constName, key, senderFile }) => {
      expect(preloadSrc).toContain(`${constName}.event.${key}`);
      // payload-less pushes end with `)` instead of `,`, so match the open paren only
      expect(readSource(senderFile)).toContain(`.send(${constName}.event.${key}`);
    },
  );

  /**
   * MENU events are dispatched data-driven: lib/menu/menu-template.js declares
   * `electronChannel` string literals (the module is shared with the Next.js
   * renderer, so it cannot depend on electron/lib). The drift test pins each
   * constant value against the template literal instead.
   *
   * Known sender-less legacy channels (bridged for API-shape compatibility,
   * no current main-process sender): onMenuNew / onMenuShowInFileManager.
   */
  const SENDERLESS_MENU_EVENTS = ["menu-new-triggered", "menu-show-in-file-manager"];

  it("every menu event channel is subscribed in preload and (unless legacy sender-less) dispatched from menu-template.js", () => {
    const menuTemplateSrc = readSource("../lib/menu/menu-template.js");
    for (const [key, value] of Object.entries(MENU_CHANNELS.event)) {
      expect(preloadSrc).toContain(`MENU_CHANNELS.event.${key}`);
      if (!SENDERLESS_MENU_EVENTS.includes(value)) {
        expect(menuTemplateSrc).toContain(`electronChannel: "${value}"`);
      }
    }
  });

  it("preload no longer hard-codes ANY channel string literal", () => {
    for (const group of Object.values(channels)) {
      for (const record of [group.invoke, group.send ?? {}, group.event]) {
        for (const value of Object.values(record)) {
          expect(preloadSrc).not.toContain(`"${value}"`);
        }
      }
    }
  });
});

describe("ipc-bridge helpers: behavior parity with the hand-written wrappers", () => {
  function makeFakeRenderer() {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    return {
      invoke: vi.fn((..._args: unknown[]) => Promise.resolve("ok")),
      send: vi.fn((..._args: unknown[]) => undefined),
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

  it("sendChannel uses fire-and-forget send (not invoke) with the same arity rules", () => {
    const renderer = makeFakeRenderer();
    const { sendChannel } = createIpcBridge(renderer);
    const sendBufferClose = sendChannel("editor:buffer-close", { arity: 1 });
    sendBufferClose("buffer-1", "unexpected-extra");
    expect(renderer.send).toHaveBeenCalledWith("editor:buffer-close", "buffer-1");
    expect(renderer.invoke).not.toHaveBeenCalled();
  });

  it("sendChannel with mapArgs reshapes positional args into the payload object", () => {
    const renderer = makeFakeRenderer();
    const { sendChannel } = createIpcBridge(renderer);
    const sendBufferSync = sendChannel(
      "editor:buffer-sync",
      (bufferId: unknown, content: unknown) => ({ bufferId, content }) as unknown,
    );
    sendBufferSync("buffer-1", "本文");
    expect(renderer.send).toHaveBeenCalledWith("editor:buffer-sync", {
      bufferId: "buffer-1",
      content: "本文",
    });
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

  it("eventChannel with arity 0 invokes the callback with no arguments (signal-only events)", () => {
    const renderer = makeFakeRenderer();
    const { eventChannel } = createIpcBridge(renderer);
    const onMenuSave = eventChannel("menu-save-triggered", { arity: 0 });
    const calls: unknown[][] = [];
    onMenuSave((...args: unknown[]) => calls.push(args));
    renderer.emit("menu-save-triggered", "main-sent-junk");
    expect(calls).toEqual([[]]);
  });

  it("eventChannel with arity 2 forwards exactly two payload args, padding with undefined", () => {
    const renderer = makeFakeRenderer();
    const { eventChannel } = createIpcBridge(renderer);
    const onFormat = eventChannel("menu-format", { arity: 2 });
    const calls: unknown[][] = [];
    onFormat((...args: unknown[]) => calls.push(args));
    renderer.emit("menu-format", "fontSize", "increase", "extra-dropped");
    renderer.emit("menu-format", "verticalWriting");
    expect(calls).toEqual([
      ["fontSize", "increase"],
      ["verticalWriting", undefined],
    ]);
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
