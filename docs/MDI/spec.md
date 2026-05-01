---
title: MDI 構文仕様
slug: mdi-spec
type: spec
status: draft
updated: 2026-04-18
tags:
  - mdi
  - syntax
---

# MDI 構文仕様（MDI 1.0 Draft）

このページは、ルートにあった `MDI.md` 草稿を `docs/MDI/` に正式収編したものです。  
初版では既存の英文ドラフト本文を保持しつつ、入口と周辺文脈だけを日文側へ整理しています。

## Original Draft (English)

MDI files are Markdown documents with illusions-specific extensions for Japanese typography.
This specification defines _inline_ syntaxes that are difficult to express in standard Markdown (ruby, tate-chu-yoko, no-break, kerning, explicit line break).

## 1. Purpose & Assumptions

MDI (Markdown for Document typesetting extensions) aims to provide concise, low-conflict markup for Japanese writing.

- Target output: HTML (styling is controlled by CSS).
- MDI focuses on _semantic annotation_; appearance is delegated to CSS.
- MDI is designed to avoid collisions with common Markdown constructs (`*`, `**`, links, etc.).

## 2. Parsing Rules (Recommended)

### 2.1 Processing Order

Implementations are recommended to apply MDI inline parsing before (or alongside) standard Markdown inline parsing, with a simple left-to-right scan.
A recommended order is:

1. Handle escapes (see 3.2)
2. Ruby: `{base|ruby}`
3. Tate-chu-yoko: `^...^`
4. Bracket macros: `[[br]]`, `[[no-break:...]]`, `[[kern:...:...]]`

### 2.2 Escapes (Recommended)

To write MDI delimiter characters literally, a backslash escape is recommended.

- Escapable characters (recommended set): `\{`, `\}`, `\|`, `\^`, `\[`, `\]`, `\:`, `\.`
- If escapes are not supported, the implementation may treat ambiguous sequences as plain text.

## 3. Ruby (ルビ)

### 3.1 Syntax

`{親文字|ルビ}`

- The left side of `|` is the base text (親文字).
- The right side is the ruby text (ルビ).
- Within the ruby text, `.` (dot) may be used to indicate per-character mapping.

### 3.2 Examples

```markdown
私は{雪女|ゆき.おんな}を見た。
{東京|とう.きょう}は雨だった。
```

### 3.3 Semantics

- If the number of base characters equals the number of dot-separated ruby segments, treat as _split ruby_.
- If they do not match, implementations may:
  - Preferably treat as _group ruby_ (single `rt` for the whole base), or
  - Fallback to plain text.
- Okurigana (送り仮名) and punctuation may be included on the base side as-is.

### 3.4 HTML Conversion (Recommended)

#### Split ruby example

Input:

```markdown
{東京|とう.きょう}
```

Output (example):

```html
<ruby class="mdi-ruby">東<rt>とう</rt>京<rt>きょう</rt></ruby>
```

#### Group ruby example

Input:

```markdown
{東京|とうきょう}
```

Output (example):

```html
<ruby class="mdi-ruby">東京<rt>とうきょう</rt></ruby>
```

## 4. Tate-chu-yoko (縦中横)

### 4.1 Syntax

`^縦中横^`

- Text enclosed by caret `^` is treated as tate-chu-yoko.
- Intended for short sequences (numbers, brief Latin letters, punctuation).

### 4.2 Examples

```markdown
第^12^話
令和^7^年
^OK^
```

### 4.3 HTML Conversion (Recommended)

Input:

```markdown
^12^
```

Output (example):

```html
<span class="mdi-tcy">12</span>
```

### 4.4 Notes

- Implementations may choose to only activate this feature inside vertical writing containers.
- CSS is expected to apply `text-combine-upright` when appropriate.

## 5. No-break (改行抑止)

Japanese typography often requires preventing awkward line breaks inside proper nouns or fixed phrases.

### 5.1 Syntax

`[[no-break:文字列]]`

### 5.2 Examples

```markdown
[[no-break:東京都新宿区]]
[[no-break:被愛妄想罪]]
```

### 5.3 HTML Conversion (Recommended)

Input:

```markdown
[[no-break:ここは改行させない]]
```

Output (example):

```html
<span class="mdi-nobr">ここは改行させない</span>
```

### 5.4 CSS Example

```css
.mdi-nobr {
  white-space: nowrap;
  word-break: keep-all;
}
```

## 6. Line & Paragraph Breaks (改行 & 換段)

MDI は段落内の「改行」（line break）と、段落を分ける「換段」（paragraph break）を明確に区別します。

- **改行 (line break)** — 同じ段落のまま、視覚的な行を折り返す。縦書では同じ「段」の中で改行される。
- **換段 (paragraph break)** — 段落を区切る。出力側では新しい `<p>` / 段落要素になる。縦書では段間のアキが入る。

改行は MDI 独自の `[[br]]` と CommonMark hardbreak の両方をサポートします。換段は CommonMark の空行に準拠し、MDI 独自マーカーは用意しません（§6.2 参照）。

### 6.1 Explicit Line Break (`[[br]]`)

段落内に強制改行を挿入するための MDI 独自の構文です。
CommonMark の hardbreak（行末 2 スペース + `\n`、または `Shift+Enter` で挿入）に依存しない、明示的な改行マーカーを提供します。

**Syntax**

`[[br]]`

- 引数を取らない bracket macro です。
- 段落の途中、文字列の途中、どこにでも挿入できます。
- `.mdi` 固有の構文です。`.md` ファイルでは通常のリテラル文字列として扱われます。

**Examples**

```markdown
春は曙。[[br]]
やうやう白くなりゆく山ぎは。

[[br]][[br]]は連続した 2 回の改行として扱う。
```

**Semantics**

- `.mdi` 固有の構文。`.md` には適用しない。
- 段落（inline context）内でのみ有効。ブロックレベルでは無視される。
- CommonMark の hardbreak（`  \n` or `Shift+Enter`）とは独立しており、同一文書内での共存が可能。
- 連続した `[[br]][[br]]` は複数回の改行として扱う。
- **ルビ構文内（`{base[[br]]|ruby}` など）では `[[br]]` はリテラル文字として扱われる**。ルビの正規表現 `{[^|]+\|[^}]+}` はブラケット文字を属性値として取り込むため、`remark` 変換は発火しない。
- **コードブロック・インラインコード内では無効（エディタ / `remark` 経路）**。`remark` が先に code node として隔離するため、その経路では `[[br]]` はリテラル文字として保持される。
- **エクスポート経路（`mdi-to-html.ts`）との差異**：現状のエクスポートは文字列置換ベース（ruby/tcy/nobr/kern と同じ前処理パイプライン）のため、コードブロック・インラインコードの除外は `remark` 経路と同等には保証されない。本件は `[[br]]` 固有ではなく MDI inline 構文全般に共通する既知のギャップで、別 Issue でトークン/AST レベル置換への移行を追跡する。
- **エスケープ `\[[br]]`**：エクスポート経路（`mdi-to-html.ts`）のみでリテラル化される。エディタの `remark` 経路ではエスケープ未対応（既存の bracket macro 全般の既知の差で、`docs/MDI/roadmap.md` の escape handling 項目で追跡中）。

**HTML Conversion (Recommended)**

Input:

```markdown
春は曙。[[br]]やうやう白くなりゆく山ぎは。
```

Output (example):

```html
春は曙。<br class="mdi-break" />やうやう白くなりゆく山ぎは。
```

**CSS Example**

- エディタ内部の表示では既存の `.mdi-hardbreak-indent` クラスがインデント用スペーサーを挿入する（`<br>` 直後に `display: inline-block; width: <text-indent>em;` の空 span をデコレーションとして付加する）。
- エクスポート経路では専用の CSS ルールを追加する：

```css
br.mdi-break {
  /* 横書・縦書とも、ブラウザ既定の <br> 改行挙動を踏襲する。 */
  /* 追加のマージンや特殊処理は不要。将来的なカスタム余地として明示的なルールを置く。 */
}
```

### 6.2 Paragraph Break (換段)

段落を区切る場合は **CommonMark に準拠し、空行（`\n\n`）で表現** します。MDI 独自の換段マーカー（例：`[[pr]]`）は **意図的に導入しません**。

**Syntax**

```markdown
春は曙。やうやう白くなりゆく山ぎは。

夏は夜。月のころはさらなり。
```

- 連続する 2 つの改行（間に空行）を境に、前後が別々の段落として扱われる。
- 3 つ以上の連続空行は 1 つの段落境界として縮約される（CommonMark の標準挙動）。

**Semantics**

- ブロックレベルの区切り。remark / ProseMirror では別々の `paragraph` ノードになる。
- HTML / EPUB エクスポート経路では `<p>...</p>` のペアとして出力される。DOCX / TXT はそれぞれの形式で独自の段落区切り（DOCX は `<w:p>`、TXT は空行）に変換される。
- 段落間の視覚表現（縦書のアキ、横書の `text-indent` など）は出力側の CSS / スタイル設定に委ねられる。MDI spec 自体は具体的な CSS プロパティを規定しない。

**Why no MDI-native paragraph marker**

`[[br]]`（改行）と対になる `[[pr]]`（換段）を導入しない理由：

1. **CommonMark の空行で既に表現できる** — 空行は既存の全 Markdown エディタ・レンダラ・ツール（Pandoc, GitHub, Obsidian 等）で段落境界として解釈される。独自マーカーは重複になる。
2. **Inline / Block の非対称性** — `[[br]]` は inline 構文（段落の中に埋め込む）、換段は block 構文（段落を切り替える）。同じ bracket macro 形式で両者を表現すると、パーサ側で文脈依存の判定が必要になり、remark / ProseMirror のノード階層とも整合しない。
3. **Round-trip の曖昧さ** — `A\n\n[[pr]]\n\nB` のように両方が書かれた場合、段落境界が 1 つか 2 つか不明瞭になる。空行のみを正とすれば一意に決まる。

**Escape / edge cases**

- 段落の途中で `\n` 1 つだけ（空行なし）は CommonMark の soft break。`.mdi` ではデフォルトでは改行にならず、単なる空白として扱われる（段落内の文字の続き）。
- 明示的に段落内改行したい場合は `[[br]]` または CommonMark hardbreak (`  \n`) を使う（§6.1）。

### 6.3 Editor UX Rules

エディタ上でのキー操作と MDI 構文の対応：

| キー / 操作   | 挙動                           | Markdown 表現 | ProseMirror ノード |
| ------------- | ------------------------------ | ------------- | ------------------ |
| `Enter`       | 新しい段落（換段）             | 空行 (`\n\n`) | `paragraph`（別）  |
| `Shift+Enter` | CommonMark hardbreak（段落内） | `  \n`        | `hardbreak`        |
| `[[br]]` 入力 | MDI 改行マーカー（段落内）     | `[[br]]`      | `mdibreak`         |

**推奨運用**

- **通常の段落分け**：`Enter` を押す。CommonMark 空行として保存される。
- **同一段落内での視覚的改行**：`[[br]]` をテキストとして入力する（`.mdi` のみ）。round-trip で確実に保持される。
- **`Shift+Enter`**：CommonMark 準拠が必要なとき、または `.md` ファイルでの改行。`.mdi` では `[[br]]` を推奨。

**なぜ `[[br]]` を手入力するのか**

- 作者が「段落内改行」を意図した箇所が、保存 → 再オープン後に確実に保たれることが目的。
- CommonMark hardbreak の末尾 2 スペース形式は、外部ツール（GitHub の diff 表示・一部の整形ツール・コピペ経路など）で trim されやすい。本エディタ内では `hardbreak` ノードとして保持されるが、外部経由の round-trip には脆弱。
- `[[br]]` は MDI パーサで独立したノード (`mdibreak`) になるため、テキストとしての見た目も含めて round-trip が確実。

## 7. Kerning / Letter-spacing (字間調整)

### 7.1 Syntax

`[[kern:<量>:<文字列>]]`

- `<量>` is typically an `em` value, e.g. `-0.1em`, `+0.2em`, `0em`.
- `<文字列>` is the affected text.

### 7.2 Examples

```markdown
彼は[[kern:-0.1em:確実]]にそう言った。
[[kern:+0.3em:沈黙]]が落ちた。
```

### 7.3 HTML Conversion (Recommended)

To reduce CSS/HTML injection risk, using a CSS custom property is recommended.

Input:

```markdown
[[kern:-0.1em:言葉]]
```

Output (example):

```html
<span class="mdi-kern" style="--mdi-kern:-0.1em;">言葉</span>
```

### 7.4 CSS Example

```css
.mdi-kern {
  letter-spacing: var(--mdi-kern, 0em);
}
```

### 7.5 Validation (Recommended)

Implementations should validate `<量>`.
A conservative rule is:

- Accept only `^[+-]?\d+(\.\d+)?em$`
- If invalid, treat the whole macro as plain text (recommended) or fallback to `0em`.

## 8. Design Notes

- MDI chooses delimiter forms that avoid common Markdown collisions.
- Markup should remain human-readable: the meaning should be guessable from the text.
- The final appearance is controlled by HTML + CSS; MDI provides semantics.

## 9. Minimal Implementation Set

At minimum, implementing the following significantly improves Japanese prose readability:

- Ruby: `{漢字|かん.じ}`
- Tate-chu-yoko: `^12^`
- No-break: `[[no-break:文字列]]`
- Explicit line break: `[[br]]`

(Optionally) add kerning:

- Kerning: `[[kern:-0.1em:文字列]]`
