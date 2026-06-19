/* eslint-disable no-console */
// Auto-updater setup and manual/automatic update checks

const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { isDev, isMicrosoftStoreApp } = require("./app-constants");

// auto-updater のログ設定
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

// このビルド自体のプレリリース channel を版番号の接尾辞から判定する。
// 例: "1.2.19-beta.20260620.143000" → "beta"、"1.2.19" → null（安定版）
// 接尾辞先頭の英字部分のみ取る（タイムスタンプ ".20260620.143000" は channel 名に含めない）。
const buildChannel = (() => {
  const m = app.getVersion().match(/-([a-z]+)/);
  return m ? m[1] : null;
})();

// プレリリースビルド（-beta/-alpha）を走らせているユーザーは常に自分の channel に留まる。
// 安定版ビルドは既定で latest（opt-in 時のみ beta へ切り替える）。
if (buildChannel) {
  autoUpdater.channel = buildChannel;
  autoUpdater.allowPrerelease = true;
}

/**
 * 安定版ビルドにおける beta opt-in を AppState から読み、autoUpdater の
 * channel / allowPrerelease を決定する。プレリリースビルドは opt-in に関係なく
 * 自分の channel を維持する。各 checkForUpdates の直前に呼ぶことで、設定変更が
 * 次回チェックに反映される。
 */
async function applyBetaOptIn() {
  if (buildChannel) return; // プレリリースビルドは自分の channel を維持
  try {
    const { getStorageManager } = require("./ipc/storage-ipc");
    const appState = await getStorageManager().loadAppState();
    const allowBeta = appState?.allowBetaUpdates === true;
    autoUpdater.channel = allowBeta ? "beta" : "latest";
    autoUpdater.allowPrerelease = allowBeta;
    log.info(`アップデートchannel=${autoUpdater.channel} (beta opt-in: ${allowBeta})`);
  } catch (e) {
    log.error("beta opt-in 設定の読み込みに失敗しました:", e);
  }
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
async function checkForUpdates(manual = false) {
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
  // 設定変更を反映するため、チェック直前に opt-in を再評価して channel を確定する
  await applyBetaOptIn();
  autoUpdater.checkForUpdates();
}

/**
 * レンダラの beta opt-in トグル変更時に呼ばれる（IPC: update:reevaluate-channel）。
 * channel を再評価し、サイレントに更新確認を行う（autoDownload=false のため
 * ダイアログ表示のみ。OFF にした場合も latest へ戻す）。
 */
async function reevaluateUpdateChannel() {
  if (isDev || isMicrosoftStoreApp) return;
  await checkForUpdates(false);
}

module.exports = { setupAutoUpdater, checkForUpdates, reevaluateUpdateChannel };
