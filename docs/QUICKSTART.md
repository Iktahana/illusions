# 🚀 Illusions クイックスタートガイド

## 概要

**Illusions** は Next.js と Milkdown をベースにした、日本語小説執筆に特化したエディターです。縦書き対応、原稿用紙換算、AI アシスタント連携などの機能を備えています。

## インストール

```bash
# リポジトリをクローン
git clone <your-repo-url>
cd illusions

# 依存パッケージをインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 を開いてください。

## 主な機能

### 1. 縦書き・横書き切り替え

エディター上部のツールバーにある「縦書き / 横書き」ボタンをクリックすると、日本語の伝統的な縦書きモードに切り替わります。

```typescript
// 実装の仕組み
const [isVertical, setIsVertical] = useState(false);

<div className={isVertical ? "vertical-writing overflow-x-auto" : ""}>
  {/* エディターコンテンツ */}
</div>
```

### 2. 三カラムレイアウト

#### 左サイドバー（Explorer）
- **章管理**: 章の追加・削除・並び替え（将来実装）
- **小説設定**: タイトル、著者、あらすじ
- **スタイル**: フォント、文字サイズ、行間の調整

#### 中央（Editor）
- Milkdown ベースの Markdown エディター
- リアルタイムプレビュー
- 自動保存機能

#### 右サイドバー（Inspector）
- **AI**: 執筆アシスタント（API 連携用のスロット）
- **校正**: 文法チェック、重複表現の検出
- **統計**: 文字数、単語数、原稿用紙換算

### 3. 原稿用紙換算

日本語小説の標準フォーマット（400字詰め原稿用紙）で自動計算されます。

```typescript
const manuscriptPages = Math.ceil(charCount / 400);
// 例: 1,234文字 → 4枚（3.085枚を切り上げ）
```

### 4. StorageAdapter アーキテクチャ

拡張可能なストレージインターフェースを採用しています。

```typescript
// 現在: MockStorageAdapter（メモリ内保存）
// 将来: GoogleDriveAdapter, SynologyAdapter など

interface StorageAdapter {
  initialize(): Promise<void>;
  save(document: NovelDocument): Promise<void>;
  load(documentId: string): Promise<NovelDocument | null>;
  list(): Promise<NovelDocument[]>;
  delete(documentId: string): Promise<void>;
  isConnected(): boolean;
}
```

## ディレクトリ構成

```
illusions/
├── app/
│   ├── globals.css          # グローバルスタイル（縦書き CSS 含む）
│   ├── layout.tsx           # ルートレイアウト
│   └── page.tsx             # メインページ（三カラムレイアウト）
│
├── components/
│   ├── Navbar.tsx           # トップナビゲーション
│   ├── Explorer.tsx         # 左サイドバー
│   ├── Inspector.tsx        # 右サイドバー
│   └── Editor.tsx           # Milkdown エディター
│
├── lib/
│   ├── storage-adapter.ts   # ストレージインターフェース
│   └── storage-context.tsx  # React Context
│
└── package.json
```

## カスタマイズ

### フォントの変更

`tailwind.config.ts` でフォントファミリーを変更できます。

```typescript
fontFamily: {
  ja: [
    "'Noto Serif JP'",
    "'Hiragino Mincho ProN'",
    "'Yu Mincho'",
    "serif",
  ],
}
```

### 配色の変更

`app/globals.css` でカラースキームを調整できます。

```css
:root {
  --background: #f8fafc;  /* 背景色 */
  --foreground: #0f172a;  /* 文字色 */
}
```

### ストレージプロバイダーの追加

新しい `StorageAdapter` を実装して、`StorageProvider` で切り替えます。

```typescript
// 例: Google Drive
export class GoogleDriveAdapter implements StorageAdapter {
  // ... 実装
}

// app/page.tsx で使用
const [adapter] = useState(() => new GoogleDriveAdapter());
```

## ショートカットキー（将来実装）

| キー | 機能 |
|------|------|
| `Cmd + S` | 保存 |
| `Cmd + B` | 太字 |
| `Cmd + I` | 斜体 |
| `Cmd + Shift + V` | 縦書き切り替え |

## トラブルシューティング

### ポートが使用中

```bash
# ポート 3000 が使用中の場合
PORT=3001 npm run dev
```

### 依存関係のエラー

```bash
# node_modules を削除して再インストール
rm -rf node_modules package-lock.json
npm install
```

### Milkdown が表示されない

ブラウザのコンソールでエラーを確認してください。通常は CSS の読み込み順序の問題です。

## 次のステップ

1. **AI アシスタント連携**: OpenAI API キーを設定して執筆支援機能を有効化
2. **Google Drive 連携**: OAuth 認証を設定してクラウド保存を実現
3. **エクスポート機能**: PDF/EPUB 形式での書き出し
4. **カスタムテーマ**: ダークモードや好みの配色を作成

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build

# プロダクションサーバー起動
npm run start

# Lint チェック
npm run lint

# TypeScript 型チェック
npx tsc --noEmit
```

## 貢献

Pull Request や Issue は大歓迎です！詳しくは CONTRIBUTING.md をご覧ください。

## ライセンス

MIT License - 詳細は LICENSE ファイルをご覧ください。

---

**Illusions** で素晴らしい物語を創造しましょう！
