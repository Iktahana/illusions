# Writing Linting Rules Guide

## Overview

The illusions linting system provides Japanese text quality analysis with 22+ rules across three levels of complexity. Rules detect issues ranging from simple punctuation errors to stylistic inconsistencies that require morphological analysis or LLM inference.

**Location:** `lib/linting/`

**Three rule levels:**

| Level | Name | Dependencies | Latency | Examples |
|-------|------|-------------|---------|---------|
| L1 | Regex | None | Instant | punctuation-rules, number-format, dash-format |
| L2 | Morphological | Kuromoji tokenizer | ~50ms | word-repetition, passive-overuse, desu-masu-consistency |
| L3 | LLM | LLM inference API | ~2-8s | Homophone detection (同音異義語) |

---

## Rule Hierarchy and Base Classes

**File:** `base-rule.ts`

All rules extend one of the following abstract base classes depending on their level and scope.

### L1 Rules

#### AbstractLintRule (per-paragraph)

The simplest rule type. Receives plain text and returns issues found via regex or string matching.

```typescript
abstract class AbstractLintRule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly nameJa: string;
  abstract readonly description: string;
  abstract readonly descriptionJa: string;
  abstract readonly level: "L1";
  abstract readonly defaultConfig: LintRuleConfig;

  // Engine identifier (currently "regex" for L1)
  abstract readonly engine: string;

  // Core method: analyze text, return issues
  abstract lint(text: string, config: LintRuleConfig): LintIssue[];
}
```

#### AbstractDocumentLintRule (document-level)

For rules that need cross-paragraph context (e.g., notation consistency across the entire document).

```typescript
abstract class AbstractDocumentLintRule extends AbstractLintRule {
  // Receives all paragraphs at once
  abstract lintDocument(
    paragraphs: ParagraphInfo[],
    config: LintRuleConfig
  ): LintIssue[];
}
```

### L2 Rules

#### AbstractMorphologicalLintRule (per-paragraph)

Receives pre-tokenized text from kuromoji. Each token includes surface form, POS, reading, base form, and conjugation info.

```typescript
abstract class AbstractMorphologicalLintRule {
  abstract readonly level: "L2";
  abstract readonly engine: string; // "morphological"

  // Receives tokens from kuromoji
  abstract lintWithTokens(
    text: string,
    tokens: KuromojiToken[],
    config: LintRuleConfig
  ): LintIssue[];
}
```

#### AbstractMorphologicalDocumentLintRule (document-level)

Combines morphological analysis with document-wide scope. Used for rules like `desu-masu-consistency` that detect style shifts across the entire document.

```typescript
abstract class AbstractMorphologicalDocumentLintRule {
  // Receives all paragraphs with their tokens
  abstract lintDocumentWithTokens(
    paragraphs: ParagraphInfo[],
    config: LintRuleConfig
  ): LintIssue[];
}
```

### L3 Rules

#### AbstractLlmLintRule

Asynchronous rules that submit candidate issues to an LLM for validation or generation.

```typescript
abstract class AbstractLlmLintRule {
  abstract readonly level: "L3";

  // Async LLM-based analysis
  abstract lintWithLlm(
    sentences: string[],
    config: LintRuleConfig,
    llmClient: ILlmClient,
    signal?: AbortSignal
  ): Promise<LintIssue[]>;
}
```

---

## Core Types

**File:** `types.ts`

### LintIssue

Every rule returns an array of `LintIssue` objects:

```typescript
interface LintIssue {
  ruleId: string;          // Rule identifier (e.g., "punctuation-rules")
  severity: "error" | "warning" | "info";
  message: string;         // English message
  messageJa: string;       // Japanese message (displayed to user)
  from: number;            // Start offset in plain text
  to: number;              // End offset in plain text
  reference?: string;      // Standard reference (e.g., "JIS X 4051:2004")
  originalText?: string;   // The problematic text
  llmValidated?: boolean;  // True if confirmed by LLM
  fix?: {                  // Optional auto-fix
    text: string;          // Replacement text
  };
}
```

### LintRuleConfig

```typescript
interface LintRuleConfig {
  enabled: boolean;
  severity: "error" | "warning" | "info";
  skipDialogue?: boolean;      // Skip text inside 「」『』
  skipLlmValidation?: boolean; // Skip L3 validation step
  options?: Record<string, unknown>; // Rule-specific options
}
```

### Type Guards

Use these to determine a rule's capabilities at runtime:

```typescript
isDocumentLintRule(rule)              // Has lintDocument()
isMorphologicalLintRule(rule)         // Has lintWithTokens()
isMorphologicalDocumentLintRule(rule) // Has lintDocumentWithTokens()
isLlmLintRule(rule)                   // Has lintWithLlm()
```

---

## RuleRunner

**File:** `rule-runner.ts`

The `RuleRunner` orchestrates rule execution, manages configuration, and respects enable/disable toggles.

### Key Methods

| Method | Description |
|--------|-------------|
| `registerRule(rule)` | Register a rule instance |
| `setConfig(ruleId, config)` | Override config for a specific rule |
| `runAll(text)` | Run all enabled L1 rules on text |
| `run(ruleId, text)` | Run a specific L1 rule |
| `runDocumentRules(paragraphs)` | Run all enabled document-level rules |
| `runWithTokens(text, tokens)` | Run all enabled L2 per-paragraph rules |
| `runDocumentWithTokens(paragraphs)` | Run all enabled L2 document-level rules |
| `runWithLlm(sentences, llmClient, signal?)` | Run all enabled L3 rules |

The runner handles:
- Filtering by `enabled` state
- Applying `skipDialogue` masking
- Guideline-based filtering
- Merging preset config with runtime overrides

---

## Preset System

**File:** `lint-presets.ts`

Five built-in presets control which rules are active and at what severity:

| Preset | Description | Use Case |
|--------|-------------|----------|
| `relaxed` | Minimal checks, info-level only | Casual writing, drafts |
| `standard` | Balanced checks | General purpose |
| `strict` | All rules at warning/error level | Professional editing |
| `novel` | Optimized for fiction writing | Creative writing |
| `official` | Follows government publication standards | Official documents |

### Using Presets

```typescript
import { getPresetForMode } from "@/lib/linting/lint-presets";

// Get a preset config map
const config = getPresetForMode("novel");
// Returns: Record<string, LintRuleConfig>
```

The `getPresetForMode()` function merges mode-specific overrides onto the `standard` preset as a base.

### Rule Categories

Rules are organized into five categories for the settings UI:

| Category | Japanese Label | Examples |
|----------|---------------|----------|
| Punctuation & Notation | 約物・表記 | punctuation-rules, dash-format, number-format |
| Kanji & Characters | 漢字・用字 | joyo-kanji, notation-consistency |
| Grammar & Usage | 文法・語法 | particle-no-repetition, conjugation-errors, correlative-expression |
| Style | 文体 | sentence-ending-repetition, sentence-length, desu-masu-consistency |
| AI Proofreading | AI校正 | L3 rules (homophone detection, etc.) |

---

## Data Files

**Directory:** `lib/linting/data/`

| File | Content | Count |
|------|---------|-------|
| `joyo-kanji.ts` | Joyo kanji set (常用漢字表 2010) | 2,136 characters |
| `jinmeiyo-kanji.ts` | Jinmeiyo kanji set (人名用漢字) | 863 characters |
| `notation-variants.ts` | Notation variant groups for consistency checking | 66 groups |
| `adverb-variants.ts` | Adverb variant groups | 30 groups |
| `counter-words.ts` | Counter word entries with valid noun pairings | 7 entries |

### Notation Variants Example

```typescript
// From notation-variants.ts
{
  canonical: "打ち合わせ",
  variants: ["打合せ", "打合わせ", "打ち合せ"],
}
```

The `notation-consistency` rule uses these groups to detect when an author uses multiple spellings of the same word within a single document.

---

## Helper Functions

**Directory:** `lib/linting/helpers/`

### Sentence Splitter

**File:** `helpers/sentence-splitter.ts`

```typescript
import { splitIntoSentences } from "@/lib/linting/helpers/sentence-splitter";

const sentences = splitIntoSentences("first sentence. second sentence.");
// Splits on: 。 ！ ？ ! ? \n
```

Used by rules that operate at the sentence level (e.g., sentence-length, sentence-ending-repetition).

### Dialogue Mask

**File:** `helpers/dialogue-mask.ts`

```typescript
import { isInDialogue } from "@/lib/linting/helpers/dialogue-mask";

const inDialogue = isInDialogue(text, position);
// Checks if position is inside 「」 or 『』
```

Many rules skip dialogue text because fictional speech intentionally uses informal or non-standard grammar. Rules that support this check `config.skipDialogue`.

---

## Complete Rule Reference

### L1 Rules (15 rules)

| Rule ID | Scope | Description |
|---------|-------|-------------|
| `punctuation-rules` | per-paragraph | Validates punctuation usage per JIS X 4051:2004 |
| `number-format` | per-paragraph | Checks numeral formatting per government guidelines |
| `joyo-kanji` | per-paragraph | Flags non-joyo kanji (outside 2,136 standard set) |
| `era-year-validator` | per-paragraph | Validates Japanese era year ranges (e.g., 令和) |
| `particle-no-repetition` | per-paragraph | Detects repeated の particle chains |
| `conjugation-errors` | per-paragraph | Catches common conjugation mistakes |
| `redundant-expression` | per-paragraph | Flags redundant phrases (e.g., 頭痛が痛い) |
| `verbose-expression` | per-paragraph | Suggests concise alternatives for wordy phrases |
| `sentence-ending-repetition` | per-paragraph | Detects repeated sentence endings (e.g., ~た。~た。~た。) |
| `correlative-expression` | per-paragraph | Checks correlative pairs (e.g., もし...ならば) |
| `notation-consistency` | document-level | Detects inconsistent notation across the document |
| `sentence-length` | per-paragraph | Warns on overly long sentences |
| `dash-format` | per-paragraph | Validates dash character usage |
| `dialogue-punctuation` | per-paragraph | Checks punctuation inside dialogue brackets |
| `comma-frequency` | per-paragraph | Flags excessive comma usage in a single sentence |

### L2 Rules (7 rules)

| Rule ID | Scope | Description |
|---------|-------|-------------|
| `desu-masu-consistency` | document-level | Detects mixed desu/masu and da/dearu styles |
| `conjunction-overuse` | per-paragraph | Flags excessive conjunction usage |
| `word-repetition` | per-paragraph | Detects repeated words in close proximity |
| `taigen-dome-overuse` | per-paragraph | Flags excessive noun-ending sentences (体言止め) |
| `passive-overuse` | per-paragraph | Detects excessive passive voice usage |
| `counter-word-mismatch` | per-paragraph | Checks counter word + noun agreement |
| `adverb-form-consistency` | document-level | Detects inconsistent adverb forms across the document |

---

## How to Add a New L1 Rule

Follow these steps to add a new regex-based linting rule.

### Step 1: Create the Rule File

Create a new file in `lib/linting/rules/`:

```typescript
// lib/linting/rules/example-rule.ts
import type { LintIssue, LintRuleConfig } from "../types";
import { AbstractLintRule } from "../base-rule";
import { isInDialogue } from "../helpers/dialogue-mask";

export class ExampleRule extends AbstractLintRule {
  readonly id = "example-rule";
  readonly name = "Example Rule";
  readonly nameJa = "例示ルール";
  readonly description = "Detects example patterns in Japanese text";
  readonly descriptionJa = "日本語テキスト内の例示パターンを検出します";
  readonly level = "L1" as const;
  readonly engine = "regex";

  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  // Pattern to detect
  private readonly pattern = /problematic-pattern/g;

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    const issues: LintIssue[] = [];

    let match: RegExpExecArray | null;
    while ((match = this.pattern.exec(text)) !== null) {
      const from = match.index;
      const to = from + match[0].length;

      // Skip if inside dialogue and skipDialogue is enabled
      if (config.skipDialogue && isInDialogue(text, from)) {
        continue;
      }

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Description of the issue in English",
        // MUST reference the relevant standard
        messageJa:
          "JIS X 4051:2004に基づき、問題の説明をここに記述します",
        from,
        to,
        reference: "JIS X 4051:2004",
        originalText: match[0],
        fix: {
          text: "suggested-replacement",
        },
      });
    }

    return issues;
  }
}
```

### Step 2: Register the Rule

Add the rule to the rule registry so the `RuleRunner` discovers it:

```typescript
// In the rule registration file
import { ExampleRule } from "./rules/example-rule";

ruleRunner.registerRule(new ExampleRule());
```

### Step 3: Add Preset Configuration

Update `lib/linting/lint-presets.ts` to include the new rule in each preset:

```typescript
// In each preset configuration
"example-rule": {
  enabled: true,
  severity: "warning",
  skipDialogue: true,
},
```

### Step 4: Add Settings UI Metadata

Update `components/LintingSettings.tsx` to add an entry in `LINT_RULES_META`:

```typescript
{
  id: "example-rule",
  name: "Example Rule",
  nameJa: "例示ルール",
  category: "punctuation", // or "kanji", "grammar", "style", "ai"
}
```

### Step 5: Verify

- Ensure the rule is listed in the linting settings UI
- Test with sample text containing the target pattern
- Verify `skipDialogue` works correctly when enabled
- Check that the `reference` field cites the correct standard

---

## Standards Compliance

All user-facing messages (`messageJa`) **must** reference the relevant official standard. This ensures users understand the authority behind each suggestion.

### Required Format

```
{standard名}に基づき、{問題の説明}
```

### Reference Standards

| Standard | Scope | Example Usage |
|----------|-------|---------------|
| JIS X 4051:2004 | Punctuation (約物) | Punctuation placement, dash formatting |
| 文化庁「公用文作成の考え方」(2022) | Numeral formatting, correlative expressions | Number format, paired expressions |
| 文化庁 常用漢字表 (2010) | 2,136 standard kanji | Non-joyo kanji detection |
| 文化庁「送り仮名の付け方」(1973) | Okurigana rules | Okurigana consistency |
| 文化庁「外来語の表記」(1991) | Katakana long vowels | Foreign word notation |
| 日本語スタイルガイド | Stylistic rules | Sentence length, repetition, overuse patterns |

### Example Messages

```typescript
// Good: References specific standard
messageJa: "JIS X 4051:2004に基づき、全角ダッシュ（――）は偶数個で使用してください"

// Good: References government guideline
messageJa: "文化庁「公用文作成の考え方」に基づき、大きな数は漢数字を使用してください"

// Bad: No standard reference
messageJa: "ダッシュの使い方が間違っています"  // DO NOT do this
```

---

## Known Limitations

- **Single-character kanji variants** (事/こと, 物/もの) may produce false positives when they match as substrings of compound words
- **Correlative expression** `全く` can be used in positive contexts, causing false positives in non-negative usage
- **Correlative expression** `いくら` can mean "how much?" outside concessive patterns, producing false positives
- **Odd-count ellipsis** (e.g., `...` instead of `......`) is not currently detected by the punctuation regex
- **L2 tokenization accuracy** depends on kuromoji's dictionary coverage; rare or domain-specific terms may be mis-tokenized

---

## Related Documentation

- [Milkdown Plugin Development Guide](./milkdown-plugin.md) -- Plugin architecture and linting integration
- [Keyboard Shortcuts Reference](./keyboard-shortcuts.md) -- Editor shortcuts and menu structure
- [Storage Architecture](../architecture/storage-architecture.md) -- How linting settings are persisted
