# Text Statistics — Architecture Design

**対象機能**: 日本語原稿用紙換算統計  
**ステータス**: 実装中  
**ブランチ**: `feature/text-statistics-manuscript`

---

## 目的

エディタの「統計」パネルに表示する文字数・原稿用紙換算枚数を、正確かつ一貫した基準で計算する。
具体的には以下を解決する:

- `replace(/\s/g, "")` ベースの旧実装が Markdown/MDI/HTML 記法を適切に除外できていない
- UI 文言と実装が不一致
- 全体統計・前日比較・選択文字数で計算基準がズレている

---

## 設計方針

### ソースオブトゥルースの一本化

```
rawContent (エディタの生テキスト)
    │
    ▼  extractVisibleText()
visibleText (可視本文のみ)
    │
    ├──▶ countVisibleChars()       → visibleTextCharCount
    ├──▶ countManuscriptCells()    → manuscriptCellCount
    │         └──▶ countManuscriptPages() → manuscriptPages
    └──▶ countParagraphs()         → paragraphCount
```

すべての統計（全体・前日比較・選択）が同じ `extractVisibleText` → `count*` パイプラインを通る。

### モジュール構成

| ファイル                                    | 役割                                                            |
| ------------------------------------------- | --------------------------------------------------------------- |
| `lib/editor-page/text-statistics.ts`        | Pure functions（副作用ゼロ）。テスト可能。                      |
| `lib/editor-page/use-text-statistics.ts`    | React hook。`computeTextStatistics` をメモ化して返す。          |
| `lib/editor-page/use-previous-day-stats.ts` | 前日スナップショット取得。同じ `computeTextStatistics` を使用。 |
| `lib/editor-page/use-selection-tracking.ts` | 選択文字数。`extractVisibleText` + `countVisibleChars` を使用。 |
| `components/inspector/StatsPanel.tsx`       | UI 表示のみ。計算は行わない。                                   |

---

## Pure Functions 仕様

### `extractVisibleText(rawContent: string): string`

Markdown / MDI / HTML のマークアップを除去し、可視本文のみを返す。

除去ルール（この順番で適用）:

| 記法                               | 処理                           |
| ---------------------------------- | ------------------------------ |
| コードブロック ` ``` ... ``` `     | 全削除                         |
| インラインコード `` `...` ``       | 全削除                         |
| 画像 `![alt](http://example)`      | alt 含め全削除                 |
| リンク `[text](http://example)`    | `text` のみ残す                |
| MDI ルビ `{親文字\|ルビ}`          | 親文字のみ残す                 |
| MDI 縦中横 `^内容^`                | 内容のみ残す                   |
| MDI no-break `[[no-break:文字列]]` | 文字列のみ残す                 |
| MDI kern `[[kern:量:文字列]]`      | 文字列のみ残す                 |
| HTML タグ `<tag>`                  | タグ記号のみ除去、内容は残す   |
| Markdown 見出し（行頭 `#+ `）      | `#` と空白のみ除去、本文は残す |
| 強調 `**`, `__`, `*`, `_`, `~~`    | 記号のみ除去、内容は残す       |
| バックスラッシュエスケープ `\X`    | `\` のみ除去                   |

### `countVisibleChars(visibleText: string): number`

- 空白・改行（`\s`）を除いた文字数を返す
- `Array.from` でサロゲートペア対応

### `countManuscriptCells(visibleText: string): number`

400字詰原稿用紙（20字×20行）上でのマス消費数を返す。

**計算モデル**:

- 1文字 = 1マス
- 1行 = 20マス（`CHARS_PER_LINE`）
- 1ページ = 20行 = 400マス（`CELLS_PER_PAGE`）
- 改行（`\n`）→ その行の残りマスをスキップして次行へ
- 空行 → 1行（20マス）を消費
- 戻り値 = 消費マス数合計（空白マスを含む）

**禁則処理**（`applyKinsoku`）:

行頭禁則文字（行頭に置いてはならない）:

```
、。，．）〕］｝〉》」』】ぁぃぅぇぉっゃゅょァィゥェォッャュョー！？
```

行末禁則文字（行末に置いてはならない）:

```
（〔［｛〈《「『【
```

処理方針:

- 行頭禁則文字が行頭に来ようとする → 前行に押し込む（追い出し）
- 行末禁則文字が行末に来て次文字がある → 次行頭へ追い出す
- 最大3パスで安定まで繰り返す（禁則の連鎖対応）
- DTP レベルの完全再現は不要。最低限の一貫性を優先。

### `countManuscriptPages(cells: number): number`

```
Math.ceil(cells / 400)
```

### `countParagraphs(visibleText: string): number`

- `\n+` で分割し、空でない行を含む段落を数える
- 空行のみの段落はカウントしない

---

## 具体的な入出力例

| 入力                   | visibleTextCharCount | 備考                               |
| ---------------------- | -------------------- | ---------------------------------- |
| `# 第一章`             | 3                    | `#` と空白は除去                   |
| `{東京\|とうきょう}`   | 2                    | ルビは除去、親文字のみ             |
| `^12^`                 | 2                    | 縦中横記号を除去                   |
| `[[no-break:東京都]]`  | 3                    | 記法を除去                         |
| `[[kern:-0.1em:確実]]` | 2                    | 記法を除去                         |
| `<b>太字</b>`          | 2                    | HTMLタグを除去                     |
| `` `use const here` `` | 0                    | インラインコード全削除             |
| `![alt](http://example)` | 0                    | 画像構文全削除（alt含む）          |
| 「あ」×1行 × 40行      | -                    | manuscriptCellCount=800（2ページ） |

---

## UI 文言定義

| 項目     | 表示ラベル | InfoTooltip 内容                                                                         |
| -------- | ---------- | ---------------------------------------------------------------------------------------- |
| 総字数   | 総字数     | 記法を除いた可視本文の文字数（空白・改行は含まない）                                     |
| 原稿用紙 | 原稿用紙   | 400字詰め原稿用紙（20×20）に換算した枚数。明示改行で行送り、禁則処理あり。端数切り上げ。 |
| 段落数   | 段落数     | 改行で区切られる段落の総数                                                               |
| 文数     | 文数       | 文末の句点（。）で区切られる文の数                                                       |

---

## 変更ファイル一覧

### 新規作成

- `lib/editor-page/text-statistics.ts` — Pure functions
- `lib/editor-page/__tests__/text-statistics.test.ts` — 単体テスト

### 修正

- `lib/editor-page/use-text-statistics.ts` — `computeTextStatistics` を使用
- `lib/editor-page/use-previous-day-stats.ts` — `computeTextStatistics` を使用、`manuscriptPages` を保存
- `lib/editor-page/use-selection-tracking.ts` — `extractVisibleText` + `countVisibleChars` を使用
- `components/inspector/StatsPanel.tsx` — UI 文言修正、`manuscriptCellCount` 追加表示
- `components/inspector/types.ts` — `manuscriptCellCount`, `visibleTextCharCount` 型定義追加
- `app/page.tsx` — 新統計 props を Inspector へ渡す

---

## テスト仕様

### 必須テストケース

```
extractVisibleText:
  # 第一章             → "第一章"
  {東京|とうきょう}    → "東京"
  ^12^                 → "12"
  [[no-break:東京都]]  → "東京都"
  [[kern:-0.1em:確実]] → "確実"
  <b>太字</b>          → "太字"
  `use const here`     → ""
  ![alt](http://example)  → ""

countManuscriptCells:
  "あ" × 40 行（\n区切り） → 800マス（2ページ分）
  空行 (\n\n)              → 60マス（3行）
  行頭禁則文字テスト（。が行頭に来ない）
  行末禁則文字テスト（「が行末に来ない）

computeTextStatistics（統合）:
  空文字列 → 全て 0
  MDI ルビ付きテキスト → charCount=2, manuscriptPages=1
  400字 → 1ページ
  401字 → 2ページ（420マス）
  Markdown 記法入り文章 → 記法を除いた字数

selection tracking:
  MDI 記法を含む選択範囲 → 可視本文ベースでカウント
```

---

## 近似・制限事項

- 禁則処理は最大3パスで安定するまで繰り返す。極端な連鎖は未対応。
- 行末禁則の「追い出し」で行が空になる場合は除去しない（最低1行を保持）。
- `extractVisibleText` は正規表現ベース。ネストした MDI 記法（例: ルビの中のルビ）は想定外。
- `countManuscriptCells` の空白文字（スペース等）は「1マス」として扱う（`\n` のみ改行として扱う）。
- 選択文字数は `state.doc.textBetween` から取得したテキストに `extractVisibleText` を適用する。ProseMirror がどこまでの記法を構造化するかによって精度が変わる可能性がある。
- `lib/utils/index.ts` の `calculateManuscriptPages` / `countCharacters` は旧来の簡易実装であり、本機能の計算には使用しない。
