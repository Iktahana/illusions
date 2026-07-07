/**
 * macOS sunset 通知の実行時挙動テスト。
 *
 * `vi.mock("electron-updater", ...)` は効かない — electron-updater 内部の遅延 getter が
 * 実クラス (MacUpdater 等) を construct し、そこで再度 `require("electron")` した際に
 * Vitest の SSR モックが伝播せず実パッケージ (Node 上では単なる文字列) を掴んでクラッシュする。
 * そのため window-manager.test.ts の "saveAllBeforeQuitAndInstall — functional" と同じ手法で
 * `Module._load` を直接差し替えて `electron/auto-updater.js` を読み込む。
 *
 * 1.3.0 を実際にリリースして動作確認することはできないため、可能な限りここで実挙動を固定する。
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const Module = require("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = Module._load;
const autoUpdaterPath = require.resolve("../auto-updater.js");

class FakeAutoUpdater extends EventEmitter {
  logger: unknown;
  autoDownload = true;
  allowPrerelease = false;
  allowDowngrade = false;
  checkForUpdates = vi.fn();
  downloadUpdate = vi.fn();
  quitAndInstall = vi.fn();
}

interface Harness {
  fakeAutoUpdater: FakeAutoUpdater;
  showMessageBoxMock: ReturnType<typeof vi.fn>;
  openExternalMock: ReturnType<typeof vi.fn>;
  mod: { setupAutoUpdater: () => void };
}

function loadAutoUpdaterWithMocks(params: {
  platform: string;
  currentVersion: string;
  showMessageBoxResult: unknown;
}): Harness {
  const { platform, currentVersion, showMessageBoxResult } = params;

  Object.defineProperty(process, "platform", { value: platform, configurable: true });

  const fakeAutoUpdater = new FakeAutoUpdater();
  const showMessageBoxMock = vi.fn().mockResolvedValue(showMessageBoxResult);
  const openExternalMock = vi.fn();
  const mockWindow = {};

  const mockElectron = {
    app: { getVersion: () => currentVersion },
    dialog: { showMessageBox: showMessageBoxMock },
    shell: { openExternal: openExternalMock },
  };

  // require キャッシュから対象を除去してから、Module._load を差し替えて再読込する。
  // auto-updater.js は循環依存回避のため window-manager を「イベント発火時」に遅延 require
  // する。そのためこの差し替えはここでは restore せず、テスト側の afterEach まで維持する
  // 必要がある（先に restore すると遅延 require が実モジュールを掴んで無反応になる）。
  delete require.cache[autoUpdaterPath];
  const windowManagerPath = require.resolve("../window-manager.js");
  delete require.cache[windowManagerPath];

  Module._load = (request: string, parent: unknown, isMain: boolean) => {
    if (request === "electron") return mockElectron;
    if (request === "electron-updater") return { autoUpdater: fakeAutoUpdater };
    if (request === "electron-log") {
      return {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        transports: { file: { level: "" } },
      };
    }
    if (request === "./app-constants") return { isDev: false, isMicrosoftStoreApp: false };
    if (request === "./window-manager") {
      return { getMainWindow: () => mockWindow, saveAllBeforeQuitAndInstall: async () => true };
    }
    return originalLoad(request, parent, isMain);
  };

  const mod: { setupAutoUpdater: () => void } = require(autoUpdaterPath);

  return { fakeAutoUpdater, showMessageBoxMock, openExternalMock, mod };
}

const originalPlatform = process.platform;

describe("auto-updater.js — update-available 実行時挙動 (sunset)", () => {
  afterEach(() => {
    Module._load = originalLoad;
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    delete require.cache[autoUpdaterPath];
    delete require.cache[require.resolve("../window-manager.js")];
  });

  it("macOS + 1.2.x 実行中 + 1.3.0 正式版検出 → sunset ダイアログを表示し downloadUpdate は呼ばない", async () => {
    const { fakeAutoUpdater, showMessageBoxMock, mod } = loadAutoUpdaterWithMocks({
      platform: "darwin",
      currentVersion: "1.2.22",
      showMessageBoxResult: { response: 1 },
    });

    mod.setupAutoUpdater();
    fakeAutoUpdater.emit("update-available", { version: "1.3.0" });
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1));

    const [, options] = showMessageBoxMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(options.title).toBe("サポート終了のお知らせ");
    expect(options.detail).toContain("https://www.illusions.app/downloads/");
    expect(fakeAutoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("sunset ダイアログで「公式サイトを開く」(response 0) を選ぶと shell.openExternal が呼ばれる", async () => {
    const { fakeAutoUpdater, showMessageBoxMock, openExternalMock, mod } = loadAutoUpdaterWithMocks(
      {
        platform: "darwin",
        currentVersion: "1.2.22",
        showMessageBoxResult: { response: 0 },
      },
    );

    mod.setupAutoUpdater();
    fakeAutoUpdater.emit("update-available", { version: "1.3.0" });
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(openExternalMock).toHaveBeenCalledWith("https://www.illusions.app/downloads/"),
    );
    expect(fakeAutoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("sunset ダイアログで「後で」(response 1) を選ぶと shell.openExternal は呼ばれない", async () => {
    const { fakeAutoUpdater, showMessageBoxMock, openExternalMock, mod } = loadAutoUpdaterWithMocks(
      {
        platform: "darwin",
        currentVersion: "1.2.22",
        showMessageBoxResult: { response: 1 },
      },
    );

    mod.setupAutoUpdater();
    fakeAutoUpdater.emit("update-available", { version: "1.3.0" });
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1));

    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it("Windows では 1.3.0 検出でも sunset にならず、通常の update-available フローで downloadUpdate される", async () => {
    const { fakeAutoUpdater, showMessageBoxMock, mod } = loadAutoUpdaterWithMocks({
      platform: "win32",
      currentVersion: "1.2.22",
      showMessageBoxResult: {},
    });

    mod.setupAutoUpdater();
    fakeAutoUpdater.emit("update-available", { version: "1.3.0" });
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1));

    const [, options] = showMessageBoxMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(options.title).toBe("アップデート可能");
    await vi.waitFor(() => expect(fakeAutoUpdater.downloadUpdate).toHaveBeenCalledTimes(1));
  });

  it("Linux でも同様に sunset にならない", async () => {
    const { fakeAutoUpdater, showMessageBoxMock, mod } = loadAutoUpdaterWithMocks({
      platform: "linux",
      currentVersion: "1.2.22",
      showMessageBoxResult: {},
    });

    mod.setupAutoUpdater();
    fakeAutoUpdater.emit("update-available", { version: "1.3.0" });
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1));

    const [, options] = showMessageBoxMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(options.title).toBe("アップデート可能");
  });

  it("macOS でも 1.3.0 未満への通常アップデートは sunset にならない", async () => {
    const { fakeAutoUpdater, showMessageBoxMock, mod } = loadAutoUpdaterWithMocks({
      platform: "darwin",
      currentVersion: "1.2.20",
      showMessageBoxResult: {},
    });

    mod.setupAutoUpdater();
    fakeAutoUpdater.emit("update-available", { version: "1.2.22" });
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1));

    const [, options] = showMessageBoxMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(options.title).toBe("アップデート可能");
    await vi.waitFor(() => expect(fakeAutoUpdater.downloadUpdate).toHaveBeenCalledTimes(1));
  });

  it("既に 1.3.0 を実行中の macOS では、さらなる新版 (1.3.1) も sunset にならない", async () => {
    const { fakeAutoUpdater, showMessageBoxMock, mod } = loadAutoUpdaterWithMocks({
      platform: "darwin",
      currentVersion: "1.3.0",
      showMessageBoxResult: {},
    });

    mod.setupAutoUpdater();
    fakeAutoUpdater.emit("update-available", { version: "1.3.1" });
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1));

    const [, options] = showMessageBoxMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(options.title).toBe("アップデート可能");
  });

  it("macOS + 1.3.0 の beta プレリリース検出は sunset にならない（正式版のみ対象）", async () => {
    const { fakeAutoUpdater, showMessageBoxMock, mod } = loadAutoUpdaterWithMocks({
      platform: "darwin",
      currentVersion: "1.2.22",
      showMessageBoxResult: {},
    });

    mod.setupAutoUpdater();
    fakeAutoUpdater.emit("update-available", { version: "1.3.0-beta.20260706.120000" });
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1));

    const [, options] = showMessageBoxMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(options.title).toBe("アップデート可能");
  });
});
