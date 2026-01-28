# 貢獻指南 / Contributing Guide

Illusions への貢献をご検討いただき、ありがとうございます！このドキュメントでは、プロジェクトへの貢献方法をご案内します。

## 🌟 貢献の方法

### 1. バグ報告

バグを発見した場合は、以下の情報を含めて Issue を作成してください：

- **環境情報**: OS、ブラウザ、Node.js バージョン
- **再現手順**: バグを再現する具体的な手順
- **期待される動作**: どのように動作すべきか
- **実際の動作**: 実際にどう動作したか
- **スクリーンショット**: 可能であれば画像を添付

### 2. 機能リクエスト

新機能のアイデアがある場合：

1. 既存の Issue を検索して重複を確認
2. Feature Request テンプレートを使用して Issue を作成
3. 以下を含める：
   - **ユースケース**: なぜこの機能が必要か
   - **提案**: どのように実装すべきか
   - **代替案**: 他に考えられる方法

### 3. コード貢献

#### 開発環境のセットアップ

```bash
# リポジトリをフォーク後、クローン
git clone https://github.com/your-username/illusions.git
cd illusions

# 依存パッケージをインストール
npm install

# 開発サーバーを起動
npm run dev
```

#### ブランチ戦略

- `main`: 安定版
- `develop`: 開発版（プルリクエストのターゲット）
- `feature/xxx`: 新機能開発
- `fix/xxx`: バグ修正
- `refactor/xxx`: リファクタリング

```bash
# 新しいブランチを作成
git checkout -b feature/your-feature-name
```

#### コーディング規約

1. **TypeScript**: すべての新しいコードは TypeScript で記述
2. **命名規則**:
   - コンポーネント: `PascalCase` (例: `NovelEditor`)
   - 関数: `camelCase` (例: `handleSave`)
   - 定数: `UPPER_SNAKE_CASE` (例: `MAX_FILE_SIZE`)
3. **コメント**: 英語で記述（日本語は UI テキストのみ）
4. **フォーマット**: ESLint と Prettier に従う

```bash
# Lint チェック
npm run lint

# 型チェック
npx tsc --noEmit
```

#### コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) 形式を使用：

```
type(scope): subject

body (optional)

footer (optional)
```

**Type の種類**:
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `style`: コードスタイル（機能変更なし）
- `refactor`: リファクタリング
- `test`: テスト追加・修正
- `chore`: ビルドプロセス・補助ツール変更

**例**:
```bash
git commit -m "feat(editor): add vertical writing mode support"
git commit -m "fix(storage): resolve localStorage quota exceeded error"
git commit -m "docs: update QUICKSTART with AI setup instructions"
```

#### プルリクエストのプロセス

1. **変更を実装**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   git push origin feature/your-feature-name
   ```

2. **Pull Request を作成**
   - `develop` ブランチに対して作成
   - テンプレートに従って記述
   - 関連する Issue をリンク

3. **PR の説明に含めること**:
   - **概要**: 何を変更したか
   - **動機**: なぜこの変更が必要か
   - **変更内容**: 具体的な変更点
   - **テスト**: どのようにテストしたか
   - **スクリーンショット**: UI 変更がある場合

4. **レビューを待つ**
   - レビュアーからのフィードバックに対応
   - CI チェックが通ることを確認

## 📁 プロジェクト構造

```
illusions/
├── app/                    # Next.js App Router
│   ├── globals.css        # グローバルスタイル
│   ├── layout.tsx         # ルートレイアウト
│   └── page.tsx           # メインページ
│
├── components/             # React コンポーネント
│   ├── Navbar.tsx         # ナビゲーションバー
│   ├── Explorer.tsx       # 左サイドバー
│   ├── Inspector.tsx      # 右サイドバー
│   └── Editor.tsx         # エディターコンポーネント
│
├── lib/                    # ユーティリティとロジック
│   ├── storage-adapter.ts # ストレージインターフェース
│   ├── storage-context.tsx# React Context
│   └── utils.ts           # 共通ユーティリティ（将来）
│
├── public/                 # 静的ファイル
├── types/                  # TypeScript 型定義（将来）
└── tests/                  # テストファイル（将来）
```

## 🧪 テスト

（現在準備中）

```bash
# ユニットテスト
npm run test

# E2E テスト
npm run test:e2e

# カバレッジ
npm run test:coverage
```

## 🎨 デザインガイドライン

### カラーパレット

```css
/* Primary */
--indigo-500: #6366f1;
--indigo-600: #4f46e5;
--indigo-700: #4338ca;

/* Neutral */
--slate-50: #f8fafc;
--slate-100: #f1f5f9;
--slate-800: #1e293b;

/* Semantic */
--success: #10b981;
--warning: #f59e0b;
--error: #ef4444;
```

### スペーシング

- 基本単位: `4px` (Tailwind の `1` = `0.25rem` = `4px`)
- 小: `8px` (2 units)
- 中: `16px` (4 units)
- 大: `24px` (6 units)

### タイポグラフィ

```css
/* 見出し */
h1: 24px / font-bold
h2: 20px / font-bold
h3: 18px / font-semibold

/* 本文 */
body: 16px / font-normal
small: 14px / font-normal
```

## 🔧 StorageAdapter の実装

新しいストレージプロバイダーを追加する場合：

```typescript
// lib/storage-google-drive.ts
import { StorageAdapter, NovelDocument } from './storage-adapter';

export class GoogleDriveAdapter implements StorageAdapter {
  private driveClient: any;
  private connected: boolean = false;

  async initialize(): Promise<void> {
    // OAuth 認証処理
    // Drive API クライアント初期化
    this.connected = true;
  }

  async save(document: NovelDocument): Promise<void> {
    if (!this.connected) throw new Error('Not connected');
    // Google Drive に保存
  }

  async load(documentId: string): Promise<NovelDocument | null> {
    // Google Drive から読み込み
    return null;
  }

  async list(): Promise<NovelDocument[]> {
    // ファイル一覧取得
    return [];
  }

  async delete(documentId: string): Promise<void> {
    // ファイル削除
  }

  isConnected(): boolean {
    return this.connected;
  }
}
```

## 📝 ドキュメント

ドキュメントの改善も大歓迎です：

- README.md: プロジェクト概要
- QUICKSTART.md: クイックスタートガイド
- PLAN.md: 開発計画とロードマップ
- API ドキュメント（将来）

## 🤝 コミュニティ

- **Discussions**: 質問や議論
- **Issues**: バグ報告や機能リクエスト
- **Pull Requests**: コード貢献

## ⚖️ ライセンス

このプロジェクトに貢献することで、あなたの貢献が MIT ライセンスの下でライセンスされることに同意したものとみなされます。

## 🙏 謝辞

すべての貢献者に感謝します！

---

質問がある場合は、遠慮なく Issue を作成するか、Discussions で質問してください。
