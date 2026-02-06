# Illusions Documentation

日本語小説エディタ Illusions のドキュメント集です。

## 📁 ドキュメント構造

### 🏗️ Architecture（アーキテクチャ設計）

システム設計やアーキテクチャに関する技術文書です。

- **[STORAGE_ARCHITECTURE.md](architecture/STORAGE_ARCHITECTURE.md)** - ストレージサービスの全体アーキテクチャ
- **[STORAGE_QUICK_REFERENCE.md](architecture/STORAGE_QUICK_REFERENCE.md)** - ストレージAPI早見表
- **[nlp-backend-architecture.md](architecture/nlp-backend-architecture.md)** - NLPバックエンドの設計
- **[notification-system.md](architecture/notification-system.md)** - 通知システムの設計

### 📖 Guides（ガイド）

開発者向けのガイドと使用方法です。

- **[QUICKSTART.md](guides/QUICKSTART.md)** - プロジェクトのクイックスタートガイド
- **[github-integration-complete.md](guides/github-integration-complete.md)** - GitHub統合機能の完全ガイド（Phase 1-4）
- **[THEME_COLORS.md](guides/THEME_COLORS.md)** - テーマカラーの定義と使用方法

### 🧪 Testing（テスト）

テスト結果とバグレポートです。

- **[UI-TESTING-RESULTS-20260206.md](testing/UI-TESTING-RESULTS-20260206.md)** - UI包括テスト結果（2026-02-06）

---

## 🚀 すぐに始めたい方へ

1. **[QUICKSTART.md](guides/QUICKSTART.md)** を読む
2. プロジェクトをセットアップ: `npm install && npm run dev`
3. GitHub統合を使う場合: **[github-integration-complete.md](guides/github-integration-complete.md)** を参照

## 🔍 アーキテクチャを理解したい方へ

1. **[STORAGE_ARCHITECTURE.md](architecture/STORAGE_ARCHITECTURE.md)** でストレージ設計を理解
2. **[nlp-backend-architecture.md](architecture/nlp-backend-architecture.md)** でNLP機能を理解
3. 各コンポーネントのコードを確認

## 🐛 バグを見つけた場合

1. **[UI-TESTING-RESULTS-20260206.md](testing/UI-TESTING-RESULTS-20260206.md)** で既知の問題を確認
2. 新しい問題の場合は GitHub Issues で報告

---

**Last Updated**: 2026-02-06
