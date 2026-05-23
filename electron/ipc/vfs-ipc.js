/* eslint-disable no-console */
/**
 * VFS IPC handlers for Electron
 *
 * Phase 4: VFS file IPC（open-directory / read-file / write-file / read-directory /
 * stat / mkdir / delete / rename / set-root）削除済み。新 IO 抽象は Phase 7 で導入。
 *
 * Phase 5 まで残置: vfs:index-lock:acquire / release（HistoryService 連携のため）。
 * Phase 5 でこれらも削除する。
 */

const { ipcMain, app } = require("electron");

function registerVFSHandlers() {
  // ===== Index lock (Phase 5 まで残置) =====================================
  // 複数ウィンドウ間で history index.json を排他的に更新するためのロック。
  // Phase 5 で history-service 本体と一緒に削除する。

  /** @type {Map<string, number>} key -> webContentsId of current owner */
  const indexLockOwner = new Map();
  /** @type {Map<string, Array<{resolve: () => void, senderId: number}>>} */
  const indexLockQueue = new Map();

  function processIndexLockQueue(key) {
    const queue = indexLockQueue.get(key);
    if (!queue || queue.length === 0) return;

    const next = queue.shift();
    if (!next) return;

    if (!indexLockOwner.has(key)) {
      next.resolve();
      return;
    }
    if (queue.length === 0) {
      indexLockQueue.delete(key);
    }
  }

  ipcMain.handle("vfs:index-lock:acquire", async (event, key) => {
    const senderId = event.sender.id;

    if (!indexLockOwner.has(key)) {
      indexLockOwner.set(key, senderId);
      return;
    }

    await new Promise((resolve) => {
      const queue = indexLockQueue.get(key) || [];
      queue.push({ resolve, senderId });
      indexLockQueue.set(key, queue);
    });

    indexLockOwner.set(key, senderId);
  });

  ipcMain.handle("vfs:index-lock:release", (event, key) => {
    const senderId = event.sender.id;
    if (indexLockOwner.get(key) === senderId) {
      indexLockOwner.delete(key);
      processIndexLockQueue(key);
    }
  });

  function releaseLocksForWindow(webContentsId) {
    for (const [key, ownerId] of indexLockOwner) {
      if (ownerId === webContentsId) {
        indexLockOwner.delete(key);
        processIndexLockQueue(key);
      }
    }
  }

  app.on("browser-window-created", (_, win) => {
    const wcId = win.webContents.id;
    win.webContents.on("destroyed", () => {
      releaseLocksForWindow(wcId);
    });
  });
}

module.exports = { registerVFSHandlers };
