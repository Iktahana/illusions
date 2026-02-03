# MDI (Illusion Markdown) Syntax Specification (MDI 1.0 Draft)

MDI files are Markdown documents with Illusions-specific extensions for Japanese typography.
This specification defines *inline* syntaxes that are difficult to express in standard Markdown (ruby, tate-chu-yoko, no-break, kerning).

## 1. Purpose & Assumptions

MDI (Markdown for Document typesetting extensions) aims to provide concise, low-conflict markup for Japanese writing.

- Target output: HTML (styling is controlled by CSS).
- MDI focuses on *semantic annotation*; appearance is delegated to CSS.
- MDI is designed to avoid collisions with common Markdown constructs (`*`, `**`, links, etc.).

## 2. Parsing Rules (Recommended)

### 2.1 Processing Order

Implementations are recommended to apply MDI inline parsing before (or alongside) standard Markdown inline parsing, with a simple left-to-right scan.
A recommended order is:

1. Handle escapes (see 3.2)
2. Ruby: `{base|ruby}`
3. Tate-chu-yoko: `^...^`
4. Bracket macros: `[[no-break:...]]`, `[[kern:...:...]]`

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

- If the number of base characters equals the number of dot-separated ruby segments, treat as *split ruby*.
- If they do not match, implementations may:
  - Preferably treat as *group ruby* (single `rt` for the whole base), or
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

## 6. Kerning / Letter-spacing (字間調整)

### 6.1 Syntax

`[[kern:<量>:<文字列>]]`

- `<量>` is typically an `em` value, e.g. `-0.1em`, `+0.2em`, `0em`.
- `<文字列>` is the affected text.

### 6.2 Examples

```markdown
彼は[[kern:-0.1em:確実]]にそう言った。
[[kern:+0.3em:沈黙]]が落ちた。
```

### 6.3 HTML Conversion (Recommended)

To reduce CSS/HTML injection risk, using a CSS custom property is recommended.

Input:

```markdown
[[kern:-0.1em:言葉]]
```

Output (example):

```html
<span class="mdi-kern" style="--mdi-kern:-0.1em;">言葉</span>
```

### 6.4 CSS Example

```css
.mdi-kern {
  letter-spacing: var(--mdi-kern, 0em);
}
```

### 6.5 Validation (Recommended)

Implementations should validate `<量>`.
A conservative rule is:

- Accept only `^[+-]?\d+(\.\d+)?em$`
- If invalid, treat the whole macro as plain text (recommended) or fallback to `0em`.

## 7. Design Notes

- MDI chooses delimiter forms that avoid common Markdown collisions.
- Markup should remain human-readable: the meaning should be guessable from the text.
- The final appearance is controlled by HTML + CSS; MDI provides semantics.

## 8. Minimal Implementation Set

At minimum, implementing the following significantly improves Japanese prose readability:

- Ruby: `{漢字|かん.じ}`
- Tate-chu-yoko: `^12^`
- No-break: `[[no-break:文字列]]`

(Optionally) add kerning:

- Kerning: `[[kern:-0.1em:文字列]]`
