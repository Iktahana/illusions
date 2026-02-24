# Milkdown Plugin Development Guide

## Overview

The `milkdown-plugin-japanese-novel` package provides Japanese-specific editing capabilities for the Milkdown editor (ProseMirror-based). It extends Milkdown with custom nodes, remark syntax plugins, and decoration systems tailored for Japanese novel writing.

**Key features:**

- Ruby annotations (furigana)
- Tate-chu-yoko (horizontal-in-vertical text)
- No-break spans
- Character kerning
- Part-of-speech (POS) highlighting via kuromoji
- Linting decorations (L1/L2/L3 rules)

**Package location:** `packages/milkdown-plugin-japanese-novel/`

---

## Entry Point

```typescript
import { japaneseNovel } from "@/packages/milkdown-plugin-japanese-novel";

// Use with Milkdown Editor
Editor.make()
  .use(japaneseNovel(options))
  .create();
```

### JapaneseNovelOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `isVertical` | `boolean` | `false` | Enable vertical writing mode |
| `showManuscriptLine` | `boolean` | `false` | Show manuscript grid lines |
| `enableTcy` | `boolean` | `true` | Enable tate-chu-yoko nodes |
| `enableRuby` | `boolean` | `true` | Enable ruby annotation nodes |
| `enableNoBreak` | `boolean` | `true` | Enable no-break span nodes |
| `enableKern` | `boolean` | `true` | Enable kerning span nodes |

The function returns `MilkdownPlugin[]`, which can be spread into the editor's plugin chain.

---

## Custom Nodes

The package defines four custom ProseMirror node types. Each follows the `$nodeSchema` pattern and implements `parseDOM`, `toDOM`, `parseMarkdown`, and `toMarkdown`.

### 1. Ruby Node

**File:** `nodes/ruby.ts`

**Markdown syntax:** `{base|ruby}`

**HTML output:**
```html
<ruby><rb>base</rb><rt>ruby</rt></ruby>
```

Ruby annotations provide furigana (reading aids) above or beside kanji characters.

**Split ruby** assigns individual readings to each character using a dot separator:

```markdown
{東京|とう.きょう}
```

This renders each character with its own `<rt>` annotation, producing per-character ruby pairs:

- 東 -> とう
- 京 -> きょう

**Example usage in MDI:**
```markdown
{漢字|かんじ}の読みを付ける
{薔薇|ばら}は美しい
{東京都|とう.きょう.と}に住んでいます
```

### 2. Tate-Chu-Yoko Node

**File:** `nodes/tcy.ts`

**Markdown syntax:** `^text^`

**HTML output:**
```html
<span class="tcy">text</span>
```

Tate-chu-yoko (TCY) renders horizontal text within vertical writing mode. This is commonly used for two-digit numbers, abbreviations, and short Latin strings in Japanese vertical text.

**Example usage in MDI:**
```markdown
^12^月^31^日
^OK^をクリックする
```

### 3. No-Break Node

**File:** `nodes/nobreak.ts`

**Markdown syntax:** `[[no-break:text]]`

**HTML output:**
```html
<span class="mdi-nobr">text</span>
```

Prevents line breaking within the wrapped text. Useful for keeping compound terms or proper nouns on a single line.

**Example usage in MDI:**
```markdown
[[no-break:令和六年]]の出来事
[[no-break:東京スカイツリー]]を訪れた
```

### 4. Kern Node

**File:** `nodes/kern.ts`

**Markdown syntax:** `[[kern:value:text]]`

**HTML output:**
```html
<span class="mdi-kern" style="--mdi-kern:0.2em;">text</span>
```

Provides fine-grained character spacing control. The `value` is a CSS length unit applied as letter-spacing via a CSS custom property.

**Example usage in MDI:**
```markdown
[[kern:0.2em:タイトル]]
[[kern:-0.05em:（注）]]
```

---

## Remark Plugins

**File:** `syntax.ts`

Five remark plugins parse inline notation from Markdown/MDI source into the custom nodes above. Each plugin supports an `enable` toggle to selectively activate or deactivate parsing.

| Plugin | Syntax | Purpose |
|--------|--------|---------|
| `remarkRubyPlugin` | `{base\|ruby}` | Ruby annotation parsing |
| `remarkTcyPlugin` | `^text^` | Tate-chu-yoko parsing |
| `remarkNoBreakPlugin` | `[[no-break:text]]` | No-break span parsing |
| `remarkKernPlugin` | `[[kern:value:text]]` | Kerning span parsing |
| `remarkHeadingAnchorPlugin` | N/A | Auto-generates heading anchors |

These plugins operate at the remark (Markdown AST) level, transforming raw text into typed MDAST nodes that Milkdown then converts into ProseMirror nodes.

---

## ID Fixers

### Heading ID Fixer

**File:** `plugins/heading-id-fixer.ts`

Automatically generates deterministic IDs for heading nodes based on their text content. Uses `encodeURIComponent()` to produce URL-safe IDs.

**Behavior:**
- Runs on every document change (transaction)
- Includes infinite loop prevention to avoid recursive dispatch
- Ensures all headings have stable, content-derived IDs for anchor linking

### Paragraph ID Fixer

**File:** `plugins/paragraph-id-fixer.ts`

Assigns sequential IDs to all textblock nodes in the document.

**Behavior:**
- Runs only on Markdown load (not on every change)
- Applies IDs in reverse document order to avoid position shifts caused by earlier mutations
- Provides stable paragraph identifiers for linting and cross-referencing

---

## POS Highlighting System

**Directory:** `pos-highlight/`

The POS (Part-of-Speech) highlighting system colorizes tokens in the editor based on their grammatical role, using kuromoji morphological analysis.

### Entry Points

```typescript
import { posHighlight } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight";

// Initialize
Editor.make()
  .use(posHighlight(options))
  .create();

// Update settings at runtime
import { updatePosHighlightSettings } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight";
updatePosHighlightSettings(view, newSettings);
```

### Architecture

- **Decoration plugin** with `LRUCache(200)` for caching token results per paragraph
- **Viewport-aware**: only tokenizes paragraphs currently visible in the scroll container
- **Debounced**: 300ms delay before re-tokenization on document changes
- **Tokenization**: Uses `getNlpClient()` to access the kuromoji backend

### Supported POS Types

The system recognizes 12 part-of-speech categories, each with a configurable highlight color:

| POS | Japanese Label | Description |
|-----|---------------|-------------|
| Noun | 名詞 | Nouns and noun phrases |
| Verb | 動詞 | Verbs |
| Adjective | 形容詞 | I-adjectives |
| Adverb | 副詞 | Adverbs |
| Particle | 助詞 | Particles (は, が, を, etc.) |
| Auxiliary Verb | 助動詞 | Auxiliary verbs (です, ます, etc.) |
| Conjunction | 接続詞 | Conjunctions |
| Interjection | 感動詞 | Interjections |
| Symbol | 記号 | Symbols and punctuation |
| Adnominal | 連体詞 | Pre-noun adjectivals |
| Filler | フィラー | Fillers (えーと, あのー, etc.) |
| Other | その他 | Unclassified tokens |

---

## Linting Plugin

**Directory:** `linting-plugin/`

The linting plugin provides real-time Japanese text quality checks with inline decorations showing issues and suggested fixes.

### Entry Points

```typescript
import { linting } from "@/packages/milkdown-plugin-japanese-novel/linting-plugin";

// Initialize
Editor.make()
  .use(linting(options))
  .create();

// Update settings at runtime
import { updateLintingSettings } from "@/packages/milkdown-plugin-japanese-novel/linting-plugin";
updateLintingSettings(view, newSettings, reason);
```

### Architecture

- **Dual caches**: Separate `issueCache` and `tokenCache`, both `LRUCache(200)`
- **Viewport-aware**: only lints paragraphs visible in the scroll container
- **Debounced**: 500ms delay before re-linting on document changes
- **Three rule levels**:
  - **L1 (Regex)**: Pattern matching, no external dependencies
  - **L2 (Morphological)**: Requires kuromoji tokenization via `INlpClient`
  - **L3 (LLM)**: Async inference with 8-second debounce and `AbortSignal` support
- **Ignored corrections**: Filters out dismissed issues via hash matching

### LLM Validation (L3)

L3 rules submit candidate issues to an LLM for validation. This avoids false positives for context-dependent checks (e.g., homophone disambiguation).

- Uses an 8-second debounce to batch requests
- Supports `AbortSignal` for cancellation when the user edits during validation
- Results are cached and marked with `llmValidated: true`

---

## Shared Utilities

**File:** `shared/paragraph-helpers.ts`

### ParagraphInfo

```typescript
interface ParagraphInfo {
  node: ProseMirrorNode;  // The ProseMirror node
  pos: number;            // Absolute position in the document
  text: string;           // Plain text content
  atomAdjustments: number[];  // Offset adjustments for atom nodes
  index: number;          // Paragraph index in the document
}
```

### Functions

| Function | Description |
|----------|-------------|
| `collectParagraphs()` | Gathers all paragraph-level nodes with their positions and text |
| `getAtomOffset()` | Calculates position offset caused by atom nodes (ruby, tcy, kern, nobreak) |
| `getVisibleParagraphs()` | Filters paragraphs to only those visible in the current viewport |
| `findScrollContainer()` | Locates the nearest scrollable ancestor element |

### Why Atom Adjustments Matter

Custom inline nodes (ruby, tcy, kern, nobreak) occupy space in the ProseMirror document model but do not appear in `textContent`. When mapping lint issue positions (based on plain text offsets) back to ProseMirror positions, these atom adjustments correct for the discrepancy.

---

## File Structure

```
packages/milkdown-plugin-japanese-novel/
├── index.ts                  # Entry point: japaneseNovel()
├── syntax.ts                 # Remark plugins (5 parsers)
├── nodes/
│   ├── ruby.ts               # Ruby annotation node
│   ├── tcy.ts                # Tate-chu-yoko node
│   ├── nobreak.ts            # No-break span node
│   └── kern.ts               # Kerning span node
├── plugins/
│   ├── heading-id-fixer.ts   # Auto-generate heading IDs
│   └── paragraph-id-fixer.ts # Sequential paragraph IDs
├── pos-highlight/
│   ├── index.ts              # POS highlight entry point
│   └── ...                   # Decoration plugin, settings
├── linting-plugin/
│   ├── index.ts              # Linting entry point
│   └── ...                   # Decoration plugin, caches
└── shared/
    └── paragraph-helpers.ts  # ParagraphInfo, atom adjustments
```

---

## Related Documentation

- [Linting Rules Guide](./linting-rules.md) -- How to write and register linting rules
- [Keyboard Shortcuts Reference](./keyboard-shortcuts.md) -- Editor shortcuts and menu structure
- [MDI Syntax Specification](../../MDI.md) -- Full MDI file format specification
- [Storage Architecture](../architecture/storage-architecture.md) -- Persistence layer used by editor state
