---
title: illusions ドキュメント
slug: docs-index
type: moc
status: active
updated: 2026-04-03
tags:
  - docs
  - index
---

# illusions ドキュメント

`docs/` は、illusions の実装・設計・仕様を GitHub と Obsidian の両方から扱えるように整理した文書庫です。

- GitHub から読む場合の入口: この `README.md`
- Obsidian から読む場合の入口: [Home.md](Home.md)

## 読み始める場所

- [MDI ドキュメント](MDI/README.md)
  `.mdi` フォーマット、構文仕様、実装上の扱いを追いたい場合の入口です。
- [アーキテクチャ](architecture/)
  ストレージ、VFS、タブ管理、エクスポートなど、主要サブシステムの設計文書です。
- [開発ガイド](guides/)
  lint ルール、Milkdown 拡張、ショートカット、テーマなどの実務ガイドです。
- [セットアップ](setup/)
  ツール導入や開発支援の手順です。
- [リファレンス](references/README.md)
  外部規格や補助資料の置き場です。

## 主要ドキュメント

### MDI

- [MDI 概要](MDI/README.md)
- [MDI 構文仕様](MDI/spec.md)
- [MDI 実装ノート](MDI/implementation.md)
- [MDI ロードマップ](MDI/roadmap.md)

### アーキテクチャ

- [ストレージシステム](architecture/storage-system.md)
- [Virtual File System](architecture/vfs.md)
- [タブ管理](architecture/tab-manager.md)
- [Dockview レイアウトシステム](architecture/dockview-layout.md)
- [ターミナルサブシステム](architecture/terminal-system.md)
- [キーマップシステム](architecture/keymap-system.md)
- [プロジェクトのアップグレードと権限](architecture/project-upgrade-and-permissions.md)
- [ユーザー辞書と校正の無視設定](architecture/dictionary-and-ignored-corrections.md)
- [文書化ギャップマップ](architecture/documentation-gap-map.md)
- [エクスポートシステム](architecture/export-system.md)
- [ファイル監視](architecture/file-watcher.md)
- [履歴サービス](architecture/history-service.md)
- [プロジェクトライフサイクル](architecture/project-lifecycle.md)
- [可読性スコアリング](architecture/readability-scoring.md)
- [テキスト統計](architecture/text-statistics.md)
- [NLP バックエンド](architecture/nlp-backend-architecture.md)
- [通知システム](architecture/notification-system.md)
- [校正・AI 校正システム](architecture/correction-ai-system.ja.md)

### ガイド

- [Milkdown プラグイン開発](guides/milkdown-plugin.md)
- [Lint ルール作成](guides/linting-rules.md)
- [キーボードショートカット](guides/keyboard-shortcuts.md)
- [テーマカラー](guides/theme-colors.md)
- [ターミナルの使い方](guides/terminal.md)
- [ユーザー辞書の使い方](guides/dictionary.md)
- [オンボーディングとウェルカムフロー](guides/onboarding-and-welcome-flow.md)

## これから補う文書

- [文書化ギャップマップ](architecture/documentation-gap-map.md)
  現在の実装に対して、まだ正式ページがないサブシステムを整理した一覧です。

- 今の優先対象
  - (特になし。ギャップマップを参照してください)

### セットアップ

- [Claude Code Review 設定](setup/CLAUDE_REVIEW_SETUP.md)

## 補足

- 旧来のルート `MDI.md` は互換性のために残し、正式な入口は `docs/MDI/` に移しました。
- 歴史的な検証メモや単発レポートは [archive/](archive/) に置きます。
