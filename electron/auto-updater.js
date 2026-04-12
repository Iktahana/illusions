/* eslint-disable no-console */
// Auto-updater setup and manual/automatic update checks

const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { isDev, isMicrosoftStoreApp } = require("./app-constants");

// auto-updater のログ設定
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

// Set update channel based on app version suffix (e.g., 0.1.123-beta → beta)
// Only 'latest' (stable) channel is the default; alpha/beta users stay on their channel
const versionMatch = app.getVersion().match(/-(.+)$/);
if (versionMatch) {
  autoUpdater.channel = versionMatch[1];
  autoUpdater.allowPrerelease = true;
}

let isManualUpdateCheck = false;

// auto-updater のイベントハンドラ設定
function setupAutoUpdater() {
  // 開発モードではアップデート確認をしない
  if (isDev) {
    log.info("開発モードのため auto-updater は無効です");
    return;
  }

  // Microsoft Store 版ではストア更新と衝突するため無効化
  if (isMicrosoftStoreApp) {
    log.info("Microsoft Store 版のため auto-updater は無効です");
    return;
  }

  // ユーザー確認後に手動でダウンロードを開始するため自動ダウンロードを無効化
  autoUpdater.autoDownload = false;

  // イベント: アップデートあり
  autoUpdater.on("update-available", (info) => {
    log.info("アップデートが見つかりました:", info);
    // Defer require to avoid circular dependency with window-manager.js
    const { getMainWindow } = require("./window-manager");
    const mainWindow = getMainWindow();
    if (mainWindow) {
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          title: "アップデート可能",
          message: `新しいバージョン ${info.version} が見つかりました`,
          detail: "バックグラウンドでアップデートをダウンロードしています...",
          buttons: ["OK"],
        })
        .then(() => {
          // ダウンロード開始
          autoUpdater.downloadUpdate();
        });
    }
  });

  // イベント: ダウンロード完了
  autoUpdater.on("update-downloaded", (info) => {
    log.info("アップデートのダウンロードが完了しました:", info);
    const { getMainWindow } = require("./window-manager");
    const mainWindow = getMainWindow();
    if (mainWindow) {
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          title: "アップデート準備完了",
          message: "アップデートのダウンロードが完了しました",
          detail: "アプリを再起動してインストールしますか？",
          buttons: ["今すぐ再起動", "後で"],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) {
            // 「今すぐ再起動」
            autoUpdater.quitAndInstall();
          }
        });
    }
  });

  // イベント: エラー
  autoUpdater.on("error", (error) => {
    log.error("アップデートでエラーが発生しました:", error);
    const { getMainWindow } = require("./window-manager");
    const mainWindow = getMainWindow();
    if (isManualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "アップデートエラー",
        message: "アップデートの確認中にエラーが発生しました",
        detail: error.message || "不明なエラー",
        buttons: ["OK"],
      });
    }
    isManualUpdateCheck = false;
  });

  // イベント: 確認中
  autoUpdater.on("checking-for-update", () => {
    log.info("アップデートを確認しています...");
  });

  // イベント: アップデートなし
  autoUpdater.on("update-not-available", (info) => {
    log.info("アップデートはありません:", info);
    const { getMainWindow } = require("./window-manager");
    const mainWindow = getMainWindow();
    if (isManualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "アップデート",
        message: "最新バージョンです",
        detail: `現在のバージョン: ${app.getVersion()}`,
        buttons: ["OK"],
      });
    }
    isManualUpdateCheck = false;
  });

  // イベント: ダウンロード進捗
  autoUpdater.on("download-progress", (progressObj) => {
    const logMessage = `ダウンロード速度: ${progressObj.bytesPerSecond} - 進捗: ${progressObj.percent}%`;
    log.info(logMessage);
  });
}

// アップデート確認（手動/自動）
function checkForUpdates(manual = false) {
  if (isDev) {
    if (manual) {
      const { getMainWindow } = require("./window-manager");
      const mainWindow = getMainWindow();
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "アップデート",
          message: "開発モード",
          detail: "開発モードではアップデート機能は無効です。",
          buttons: ["OK"],
        });
      }
    }
    return;
  }

  if (isMicrosoftStoreApp) {
    if (manual) {
      const { getMainWindow } = require("./window-manager");
      const mainWindow = getMainWindow();
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "アップデート",
          message: "Microsoft Store 版",
          detail:
            "このバージョンは Microsoft Store 経由で更新されます。ストアアプリからアップデートを確認してください。",
          buttons: ["OK"],
        });
      }
    }
    return;
  }

  isManualUpdateCheck = manual;
  autoUpdater.checkForUpdates();
}

module.exports = { setupAutoUpdater, checkForUpdates };
