# MDI Syntax Specification (MDI 1.0 Draft) {#h1-mdi10a01}

MDI files are Markdown documents with Illusions-specific extensions for Japanese typography.
This specification defines *inline* syntaxes that are difficult to express in standard Markdown (ruby, tate-chu-yoko, no-break, kerning), and a required heading anchor format.

## 1. Headings & Anchors {#h2-a1b2c3d4}

- Every heading must include an anchor suffix.
- Anchor format: `{#h<level>-<uuid>}`
- `level` is the heading level (`1`-`6`).
- `uuid` is an 8-character lowercase alphanumeric ID.
- The anchor suffix must appear at the end of the heading line.

Example:

```markdown
# 第一章 序幕 {#h1-a1b2c3d4}
## 第一節 相遇 {#h2-e5f6g7h8}
### 場面一 {#h3-i9j0k1l2}
```

## 2. Purpose & Assumptions {#h2-b4c5d6e7}

MDI (Markdown for Document typesetting extensions) aims to provide concise, low-conflict markup for Japanese writing.

- Target output: HTML (styling is controlled by CSS).
- MDI focuses on *semantic annotation*; appearance is delegated to CSS.
- MDI is designed to avoid collisions with common Markdown constructs (`*`, `**`, links, etc.).

## 3. Parsing Rules (Recommended) {#h2-c8d9e0f1}

### 3.1 Processing Order {#h3-d2e3f4a5}

Implementations are recommended to apply MDI inline parsing before (or alongside) standard Markdown inline parsing, with a simple left-to-right scan.
A recommended order is:

1. Handle escapes (see 3.2)
2. Ruby: `{base|ruby}`
3. Tate-chu-yoko: `^...^`
4. Bracket macros: `[[no-break:...]]`, `[[kern:...:...]]`

### 3.2 Escapes (Recommended) {#h3-e6f7a8b9}

To write MDI delimiter characters literally, a backslash escape is recommended.

- Escapable characters (recommended set): `\{`, `\}`, `\|`, `\^`, `\[`, `\]`, `\:`, `\.`
- If escapes are not supported, the implementation may treat ambiguous sequences as plain text.

## 4. Ruby (ルビ) {#h2-f0a1b2c3}

### 4.1 Syntax {#h3-a4b5c6d7}

`{親文字|ルビ}`

- The left side of `|` is the base text (親文字).
- The right side is the ruby text (ルビ).
- Within the ruby text, `.` (dot) may be used to indicate per-character mapping.

### 4.2 Examples {#h3-b8c9d0e1}

```markdown
私は{雪女|ゆき.おんな}を見た。
{東京|とう.きょう}は雨だった。
```

### 4.3 Semantics {#h3-c2d3e4f5}

- If the number of base characters equals the number of dot-separated ruby segments, treat as *split ruby*.
- If they do not match, implementations may:
  - Preferably treat as *group ruby* (single `rt` for the whole base), or
  - Fallback to plain text.
- Okurigana (送り仮名) and punctuation may be included on the base side as-is.

### 4.4 HTML Conversion (Recommended) {#h3-d6e7f8a9}

#### Split ruby example {#h4-e0f1a2b3}

Input:

```markdown
{東京|とう.きょう}
```

Output (example):

```html
<ruby class="mdi-ruby">東<rt>とう</rt>京<rt>きょう</rt></ruby>
```

#### Group ruby example {#h4-f4a5b6c7}

Input:

```markdown
{東京|とうきょう}
```

Output (example):

```html
<ruby class="mdi-ruby">東京<rt>とうきょう</rt></ruby>
```

## 5. Tate-chu-yoko (縦中横) {#h2-a8b9c0d1}

### 5.1 Syntax {#h3-b2c3d4e5}

`^縦中横^`

- Text enclosed by caret `^` is treated as tate-chu-yoko.
- Intended for short sequences (numbers, brief Latin letters, punctuation).

### 5.2 Examples {#h3-c6d7e8f9}

```markdown
第^12^話
令和^7^年
^OK^
```

### 5.3 HTML Conversion (Recommended) {#h3-d0e1f2a3}

Input:

```markdown
^12^
```

Output (example):

```html
<span class="mdi-tcy">12</span>
```

### 5.4 Notes {#h3-e4f5a6b7}

- Implementations may choose to only activate this feature inside vertical writing containers.
- CSS is expected to apply `text-combine-upright` when appropriate.

## 6. No-break (改行抑止) {#h2-f8a9b0c1}

Japanese typography often requires preventing awkward line breaks inside proper nouns or fixed phrases.

### 6.1 Syntax {#h3-a2b3c4d5}

`[[no-break:文字列]]`

### 6.2 Examples {#h3-b6c7d8e9}

```markdown
[[no-break:東京都新宿区]]
[[no-break:被愛妄想罪]]
```

### 6.3 HTML Conversion (Recommended) {#h3-c0d1e2f3}

Input:

```markdown
[[no-break:ここは改行させない]]
```

Output (example):

```html
<span class="mdi-nobr">ここは改行させない</span>
```

### 6.4 CSS Example {#h3-d4e5f6a7}

```css
.mdi-nobr {
  white-space: nowrap;
  word-break: keep-all;
}
```

## 7. Kerning / Letter-spacing (字間調整) {#h2-e8f9a0b1}

### 7.1 Syntax {#h3-f2a3b4c5}

`[[kern:<量>:<文字列>]]`

- `<量>` is typically an `em` value, e.g. `-0.1em`, `+0.2em`, `0em`.
- `<文字列>` is the affected text.

### 7.2 Examples {#h3-a6b7c8d9}

```markdown
彼は[[kern:-0.1em:確実]]にそう言った。
[[kern:+0.3em:沈黙]]が落ちた。
```

### 7.3 HTML Conversion (Recommended) {#h3-b0c1d2e3}

To reduce CSS/HTML injection risk, using a CSS custom property is recommended.

Input:

```markdown
[[kern:-0.1em:言葉]]
```

Output (example):

```html
<span class="mdi-kern" style="--mdi-kern:-0.1em;">言葉</span>
```

### 7.4 CSS Example {#h3-c4d5e6f7}

```css
.mdi-kern {
  letter-spacing: var(--mdi-kern, 0em);
}
```

### 7.5 Validation (Recommended) {#h3-d8e9f0a1}

Implementations should validate `<量>`.
A conservative rule is:

- Accept only `^[+-]?\d+(\.\d+)?em$`
- If invalid, treat the whole macro as plain text (recommended) or fallback to `0em`.

## 8. Design Notes {#h2-b2c3d4e5}

- MDI chooses delimiter forms that avoid common Markdown collisions.
- Markup should remain human-readable: the meaning should be guessable from the text.
- The final appearance is controlled by HTML + CSS; MDI provides semantics.

## 9. Minimal Implementation Set {#h2-c6d7e8f9}

At minimum, implementing the following significantly improves Japanese prose readability:

- Ruby: `{漢字|かん.じ}`
- Tate-chu-yoko: `^12^`
- No-break: `[[no-break:文字列]]`

(Optionally) add kerning:

- Kerning: `[[kern:-0.1em:文字列]]`
