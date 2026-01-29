# MDI Syntax Specification

MDI files are Markdown documents with Illusions-specific extensions.

## Headings & Anchors

- Every heading must include an anchor suffix.
- Anchor format: `{#h<level>-<uuid>}`
- `level` is the heading level (1-6).
- `uuid` is an 8-character lowercase alphanumeric ID.
- The anchor suffix must appear at the end of the heading line.

Example:

```markdown
# 第一章 序幕 {#h1-a1b2c3d4}
## 第一節 相遇 {#h2-e5f6g7h8}
### 場面一 {#h3-i9j0k1l2}
```

## Ruby (振仮名)

Inline ruby syntax:

```markdown
今日は{漢字|かんじ}を学ぶ
```

## Tate-chu-yoko (縦中横)

Two-digit or punctuation sequences are treated as tate-chu-yoko:

```markdown
今日は12時に集合!!
```
