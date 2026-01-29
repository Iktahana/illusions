# テーマカラー利用ガイド

## 概要

本プロジェクトでは CSS 変数でテーマカラーを一元管理し、ライト/ダークモードの切り替えに自動対応します。

## カラー変数システム

### 背景色 (Background)

| Tailwind Class | CSS Variable | 用途 | ライト | ダーク |
|----------------|--------------|------|--------|--------|
| `bg-background` | `--background` | メイン背景 | `#ffffff` | `#171717` |
| `bg-background-secondary` | `--background-secondary` | サブ背景 | `#f8fafc` | `#262626` |
| `bg-background-tertiary` | `--background-tertiary` | 第3背景 | `#f1f5f9` | `#404040` |
| `bg-background-elevated` | `--background-elevated` | モーダル/カード | `#ffffff` | `#262626` |

### 文字色 (Foreground)

| Tailwind Class | CSS Variable | 用途 | ライト | ダーク |
|----------------|--------------|------|--------|--------|
| `text-foreground` | `--foreground` | 主要テキスト | `#0f172a` | `#f5f5f5` |
| `text-foreground-secondary` | `--foreground-secondary` | サブテキスト | `#475569` | `#d4d4d4` |
| `text-foreground-tertiary` | `--foreground-tertiary` | 補助テキスト | `#64748b` | `#a3a3a3` |
| `text-foreground-muted` | `--foreground-muted` | 淡いテキスト | `#94a3b8` | `#737373` |

### 枠線色 (Border)

| Tailwind Class | CSS Variable | 用途 | ライト | ダーク |
|----------------|--------------|------|--------|--------|
| `border-border` | `--border` | 主要ボーダー | `#e2e8f0` | `#404040` |
| `border-border-secondary` | `--border-secondary` | サブボーダー | `#cbd5e1` | `#525252` |

### アクセント (Accent)

| Tailwind Class | CSS Variable | 用途 | ライト | ダーク |
|----------------|--------------|------|--------|--------|
| `bg-accent` | `--accent` | アクセント背景 | `#6366f1` | `#6366f1` |
| `text-accent-foreground` | `--accent-foreground` | アクセント文字 | `#ffffff` | `#ffffff` |
| `bg-accent-light` | `--accent-light` | 薄いアクセント | `#eef2ff` | `#312e81` |
| `bg-accent-hover` | `--accent-hover` | ホバー状態 | `#4f46e5` | `#4f46e5` |

### インタラクション (Interactive)

| Tailwind Class | CSS Variable | 用途 | ライト | ダーク |
|----------------|--------------|------|--------|--------|
| `hover:bg-hover` | `--hover` | ホバー背景 | `#f1f5f9` | `#262626` |
| `bg-active` | `--active` | アクティブ状態 | `#e0e7ff` | `#312e81` |

### ステータス色 (Status)

| Tailwind Class | CSS Variable | 用途 | 色 |
|----------------|--------------|------|----|
| `text-success` / `bg-success` | `--success` | 成功 | `#10b981` |
| `text-warning` / `bg-warning` | `--warning` | 警告 | `#f59e0b` |
| `text-error` / `bg-error` | `--error` | エラー | `#ef4444` |
| `text-info` / `bg-info` | `--info` | 情報 | `#3b82f6` |

## 使用例

### ✅ 推奨（テーマに自動追従）

```tsx
// メインコンテナ
<div className="bg-background text-foreground">

// サブ領域
<div className="bg-background-secondary border border-border">

// ボタン
<button className="bg-accent text-accent-foreground hover:bg-accent-hover">

// 見出し
<h1 className="text-foreground">

// サブテキスト
<p className="text-foreground-secondary">

// ボーダー
<div className="border border-border">

// ホバー効果
<button className="hover:bg-hover">

// アクティブ状態
<button className="bg-active">
```

### ❌ 非推奨（ダークモードを手動管理が必要）

```tsx
// ❌ こう書くと dark: の管理が必要
<div className="bg-white dark:bg-neutral-900">
<div className="text-slate-900 dark:text-neutral-100">
<div className="border-slate-200 dark:border-neutral-700">
```

## 移行ガイド

### 旧 → 新 カラーマッピング

#### 背景色

```
bg-white                    → bg-background
bg-slate-50 / bg-slate-100  → bg-background-secondary
bg-slate-200                → bg-background-tertiary
dark:bg-neutral-900         → bg-background (自動)
dark:bg-neutral-800         → bg-background-secondary (自動)
```

#### 文字色

```
text-slate-800 / text-slate-900  → text-foreground
text-slate-600 / text-slate-700  → text-foreground-secondary
text-slate-500                   → text-foreground-tertiary
text-slate-400                   → text-foreground-muted
```

#### 枠線色

```
border-slate-200             → border-border
border-slate-300             → border-border-secondary
dark:border-neutral-700      → border-border (自動)
```

#### アクセント

```
bg-indigo-100               → bg-accent-light
bg-indigo-600               → bg-accent
text-indigo-700             → text-foreground (on accent-light)
hover:bg-indigo-700         → hover:bg-accent-hover
```

#### インタラクション

```
hover:bg-slate-100          → hover:bg-hover
bg-indigo-50 (active)       → bg-active
```

## 注意事項

1. `dark:` 接頭辞は不要（すべて自動でテーマに追従）
2. 具体的な色値ではなく、意味（semantic）に沿ったクラス名を使う
3. テーマカラーは `globals.css` で一元管理する
4. 新しい色が必要な場合は CSS 変数を追加する

## 特殊ケース

一部の特殊コンポーネント（例: Milkdown エディター）は特定のカラークラスを継続して利用する必要がある場合があります。その場合は現状のまま維持してください。
