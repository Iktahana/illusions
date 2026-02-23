import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for paragraph indentation rule */
const KOYO_REF: LintReference = {
  standard: "文化庁「公用文作成の考え方」(2022)",
};

/** Hiragana range start character */
const HIRAGANA_START = "\u3041"; // ぁ
/** Hiragana range end character */
const HIRAGANA_END = "\u3093"; // ん

/** Katakana range start character */
const KATAKANA_START = "\u30A1"; // ァ
/** Katakana range end character */
const KATAKANA_END = "\u30F3"; // ン

/** Kanji range start */
const KANJI_START = "\u4E00";
/** Kanji range end */
const KANJI_END = "\u9FFF";

/**
 * Determine if a character is a Japanese content character
 * (hiragana, katakana, or kanji).
 */
function isJapaneseContentChar(ch: string): boolean {
  return (
    (ch >= HIRAGANA_START && ch <= HIRAGANA_END) ||
    (ch >= KATAKANA_START && ch <= KATAKANA_END) ||
    (ch >= KANJI_START && ch <= KANJI_END)
  );
}

/**
 * ParagraphIndentationRule -- L1 regex-based rule.
 *
 * Detects paragraph text that begins directly with a Japanese character
 * without a leading ideographic space (　U+3000) or half-width space.
 * Per 公用文作成の考え方, paragraph openings should be indented by one
 * character (1字下げ).
 *
 * Note: This rule only flags text that starts with Japanese content
 * characters directly, to avoid false positives on headings, list items,
 * or non-body text.
 */
export class ParagraphIndentationRule extends AbstractLintRule {
  readonly id = "paragraph-indentation";
  override engine: CorrectionEngine = "regex";
  readonly name = "Paragraph indentation (1 character)";
  readonly nameJa = "段落行頭の1字下げ";
  readonly description =
    "Detects paragraphs that start with a Japanese character without leading indentation";
  readonly descriptionJa =
    "日本語文字で始まる段落に行頭の1字下げがない場合を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const firstChar = text[0];
    if (firstChar === undefined) return [];

    // Already indented with ideographic space or regular space
    if (firstChar === "\u3000" || firstChar === " " || firstChar === "\t") return [];

    // Only flag if the paragraph starts with a Japanese content character
    if (!isJapaneseContentChar(firstChar)) return [];

    // Skip very short texts (headings, labels) — only flag text that looks like body copy
    // Require at least 10 characters to avoid flagging headings
    if (text.length < 10) return [];

    // Skip list items (text starting with ・, 「, or common list markers)
    if (
      firstChar === "・" ||
      firstChar === "「" ||
      firstChar === "『" ||
      firstChar === "【" ||
      firstChar === "（"
    ) {
      return [];
    }

    return [
      {
        ruleId: this.id,
        severity: config.severity,
        message: "Paragraph should start with one-character indentation (公用文作成の考え方)",
        messageJa: "公用文作成の考え方に基づき、段落の行頭は1字下げ（全角スペース）にしてください",
        from: 0,
        to: 1,
        reference: KOYO_REF,
        fix: {
          label: "Add ideographic space indent",
          labelJa: "行頭に全角スペースを追加",
          replacement: "\u3000" + firstChar,
        },
      },
    ];
  }
}
