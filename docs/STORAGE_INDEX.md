# 📑 Storage Service - ドキュメント索引

## 🎯 クイックナビ

### 🚀 すぐに始めたい

1. **STORAGE_IMPLEMENTATION.md** を読む（目安 5 分）
2. **ELECTRON_INTEGRATION_CHECKLIST.md** に沿って統合（目安 15 分）
3. **STORAGE_QUICK_REFERENCE.md** で API を参照

### 📚 アーキテクチャを理解したい

1. **STORAGE_ARCHITECTURE.md** を読む
2. `lib/storage-types.ts`（コアの型/IF）を確認
3. `lib/storage-service-examples.ts`（コード例）を見る

### 🔧 統合で詰まった

1. **ELECTRON_INTEGRATION_CHECKLIST.md** を再確認
2. **STORAGE_QUICK_REFERENCE.md** の FAQ / Tips を確認
3. `lib/storage-service-examples.ts` の該当例を参照

---

## 📚 ドキュメント一覧

### コア（必読）

| ドキュメント | 目的 | いつ読む？ |
|------|------|---------|
| **STORAGE_IMPLEMENTATION.md** | 実装の全体像 | 初見時 |
| **STORAGE_INTEGRATION.md** | 統合手順 | 統合作業開始時 |
| **ELECTRON_INTEGRATION_CHECKLIST.md** | チェックリスト | 実装中 |
| **STORAGE_QUICK_REFERENCE.md** | API 早見表 | 開発中 |

### 深掘り（任意）

| ドキュメント | 内容 |
|------|------|
| **STORAGE_ARCHITECTURE.md** | フロー/モデル/設計メモ |

---

## 💻 主要コード

### 型・インターフェース

```
lib/storage-types.ts
- RecentFile
- AppState
- EditorBuffer
- StorageSession
- IStorageService
```

### ファクトリ / シングルトン

```
lib/storage-service.ts
- createStorageService()
- getStorageService()
```

### Web 実装（IndexedDB）

```
lib/web-storage.ts
- WebStorageDatabase（Dexie）
- WebStorageProvider（IStorageService 実装）
```

### Electron 実装

```
lib/electron-storage.ts
- ElectronStorageProvider（IPC クライアント）

lib/electron-storage-manager.ts
- ElectronStorageManager（SQLite / メインプロセス）
```

### 例 / テスト

```
lib/storage-service-examples.ts
lib/storage-service-tests.ts
```

---

## ✅ ひとこと

基本は **STORAGE_INTEGRATION.md** と **ELECTRON_INTEGRATION_CHECKLIST.md** だけ追えば統合できます。