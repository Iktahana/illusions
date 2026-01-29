# Electron Integration Checklist

## Electron 統合チェックリスト（完全版）

このチェックリストは `StorageService` を Electron アプリへ統合するための確認項目です。詳細なコード例は `docs/STORAGE_INTEGRATION.md` を参照してください。

---

## ✅ 手順 1: 依存関係

```bash
npm install better-sqlite3
```

- [ ] `better-sqlite3` をインストール
- [ ] `package.json` に依存が追加されている
- [ ] `npm install` / `yarn install` が完了

---

## ✅ 手順 2: `electron/main.ts` の更新

### 2.1 import

- [ ] `ElectronStorageManager` を import
- [ ] `StorageSession` / `AppState` / `RecentFile` / `EditorBuffer` を import

※ 例は `docs/STORAGE_INTEGRATION.md` を参照。

### 2.2 マネージャー生成

- [ ] `const storageManager = new ElectronStorageManager();` を作成

### 2.3 IPC ハンドラー登録

- [ ] `storage-save-session`
- [ ] `storage-load-session`
- [ ] `storage-save-app-state`
- [ ] `storage-load-app-state`
- [ ] `storage-add-to-recent`
- [ ] `storage-get-recent-files`
- [ ] `storage-remove-from-recent`
- [ ] `storage-clear-recent`
- [ ] `storage-save-editor-buffer`
- [ ] `storage-load-editor-buffer`
- [ ] `storage-clear-editor-buffer`
- [ ] `storage-clear-all`

### 2.4 終了時のクリーンアップ

- [ ] `app.on("before-quit", () => storageManager.close())` を追加

---

## ✅ 手順 3: `electron/preload.ts` の更新

- [ ] `contextBridge.exposeInMainWorld("electronAPI", { storage: ... })` を追加
- [ ] `electronAPI.storage.saveSession/loadSession/...` をすべて公開

---

## ✅ 手順 4: 型定義の確認

- [ ] `types/electron.d.ts` に `electronAPI.storage` が定義されている（必要に応じて）

---

## ✅ 手順 5: 動作確認（開発）

- [ ] TypeScript の型チェックが通る
- [ ] ESLint の警告/エラーがない

---

## ✅ 手順 6: アプリ層の統合

- [ ] 起動時に `loadSession()` を呼ぶ
- [ ] 前回ファイルの復元（`appState.lastOpenedMdiPath`）
- [ ] 未保存内容の復元（`editorBuffer`）
- [ ] 定期的に `saveEditorBuffer()` を実行（例: 30 秒）

---

## ✅ 手順 7: テスト

- [ ] Electron 版で `electronAPI.storage` が呼べる
- [ ] セッション保存 → 再起動 → 復元ができる
- [ ] 最近使用が更新される
- [ ] エディタバッファが復元できる

---

## ✅ 手順 8: ビルド

- [ ] 本番ビルドが成功
- [ ] Electron パッケージが生成される
- [ ] 実機インストールで起動・保存が動く

---

## 📚 参照

- `docs/STORAGE_INTEGRATION.md`
- `docs/STORAGE_QUICK_REFERENCE.md`
- `docs/STORAGE_ARCHITECTURE.md`
