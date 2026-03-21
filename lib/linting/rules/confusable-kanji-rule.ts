import { AbstractLintRule } from "../base-rule";
import type {
  LintIssue,
  LintRuleConfig,
  LintReference,
  CorrectionEngine,
} from "../types";

const KOYO_REF: LintReference = {
  standard: "文化庁「公用文作成の考え方」(2022)",
};

const KISHA_REF: LintReference = {
  standard: "記者ハンドブック 第14版",
};

/**
 * A confusable kanji / expression entry.
 */
interface ConfusablePair {
  /** Incorrect form to search for */
  wrong: string;
  /** Correct replacement */
  correct: string;
  /** Japanese explanation shown to the user */
  noteJa: string;
  /** Reference standard */
  ref: LintReference;
}

/**
 * Preset dictionary of commonly confused kanji and misused expressions.
 *
 * Scope: only high-confidence, context-independent mistakes are included.
 * Context-dependent corrections (e.g. 押さえる/抑える) are handled by L3 rules.
 * Okurigana errors are handled by the dedicated VerbOkuriganaStrictRule / FixedOkuriganaNounRule.
 *
 * Sources:
 * - 記者ハンドブック 第14版
 * - 文化庁「公用文作成の考え方」(2022)
 */
const CONFUSABLE_PAIRS: readonly ConfusablePair[] = [
  // ── 形の似た漢字の混同 (visually similar kanji) ──────────────────────────
  // 完璧 — commonly mistaken as 完壁 (壁=wall, 璧=jade disc)
  {
    wrong: "完壁",
    correct: "完璧",
    noteJa: "「完壁」は誤字です。「完璧」（璧=玉偏）が正しい表記です",
    ref: KISHA_REF,
  },

  // 博士 / 武士 / 紳士 — 土（つち）と士（さむらい）の混同
  {
    wrong: "博土",
    correct: "博士",
    noteJa: "「博土」は誤字です。「博士」（士=さむらい）が正しい表記です",
    ref: KISHA_REF,
  },
  {
    wrong: "武土",
    correct: "武士",
    noteJa: "「武土」は誤字です。「武士」が正しい表記です",
    ref: KISHA_REF,
  },
  {
    wrong: "紳土",
    correct: "紳士",
    noteJa: "「紳土」は誤字です。「紳士」が正しい表記です",
    ref: KISHA_REF,
  },
  {
    wrong: "勇土",
    correct: "勇士",
    noteJa: "「勇土」は誤字です。「勇士」が正しい表記です",
    ref: KISHA_REF,
  },

  // 自己 / 各自 — 己（おのれ）と已（すでに）の混同
  {
    wrong: "自已",
    correct: "自己",
    noteJa: "「自已」は誤字です。「自己」が正しい表記です",
    ref: KISHA_REF,
  },
  {
    wrong: "各已",
    correct: "各自",
    noteJa: "「各已」は誤字です。「各自」が正しい表記です",
    ref: KISHA_REF,
  },

  // 再度 — 度（ど）と渡（わたる）の混同
  {
    wrong: "再渡",
    correct: "再度",
    noteJa: "「再渡」は誤字です。「再度」が正しい表記です",
    ref: KISHA_REF,
  },

  // 繰り返し記号の脱落 — 々 を使うべき箇所で漢字が重複している
  {
    wrong: "様様",
    correct: "様々",
    noteJa: "「様様」は誤字です。繰り返し記号を使い「様々」と書きます",
    ref: KOYO_REF,
  },
  {
    wrong: "各各",
    correct: "各々",
    noteJa: "「各各」は誤字です。繰り返し記号を使い「各々」と書きます",
    ref: KOYO_REF,
  },
  {
    wrong: "日日に",
    correct: "日々に",
    noteJa: "「日日に」は誤字です。「日々に」と書きます",
    ref: KOYO_REF,
  },
  {
    wrong: "時時",
    correct: "時々",
    noteJa: "「時時」は誤字です。「時々」と書きます",
    ref: KOYO_REF,
  },

  // ── 慣用句の誤用 (misused idiomatic expressions) ─────────────────────────
  {
    wrong: "的を得る",
    correct: "的を射る",
    noteJa: "「的を得る」は誤用です。「的を射る」が正しい慣用句です",
    ref: KISHA_REF,
  },
  {
    wrong: "汚名挽回",
    correct: "汚名返上",
    noteJa: "「汚名挽回」は誤用です。「汚名返上」または「名誉挽回」が正しい慣用句です",
    ref: KISHA_REF,
  },
  {
    wrong: "取り付く暇もない",
    correct: "取り付く島もない",
    noteJa: "「取り付く暇もない」は誤用です。「取り付く島もない」が正しい慣用句です",
    ref: KISHA_REF,
  },
  {
    wrong: "煮え湯を飲む",
    correct: "煮え湯を飲まされる",
    noteJa: "「煮え湯を飲む」は誤用です。「煮え湯を飲まされる（被害を受ける）」が正しい慣用句です",
    ref: KISHA_REF,
  },
  {
    wrong: "足元をすくわれる",
    correct: "足をすくわれる",
    noteJa: "「足元をすくわれる」は誤用です。「足をすくわれる」が正しい慣用句です",
    ref: KISHA_REF,
  },
  {
    wrong: "間髪を入れず",
    correct: "間髪をいれず",
    noteJa: "「間髪を入れず」の読みは「かんはつをいれず」ではなく「かんぱつをいれず」です（「間、髪を容れず」が語源）",
    ref: KISHA_REF,
  },
] as const;

/**
 * ConfusableKanjiRule -- L1 regex-based rule.
 *
 * Detects commonly confused kanji pairs and misused idiomatic expressions
 * using a curated preset dictionary. Operates entirely offline.
 *
 * Covers requirements from GH#680 (基本文法チェックの実装（ローカル）):
 * - 誤字の指摘（プリセット辞書）
 * - 形の似た漢字の混同検出
 * - 慣用句の誤用検出
 *
 * Note: Okurigana errors are handled by VerbOkuriganaStrictRule and
 * FixedOkuriganaNounRule. Context-dependent kanji selection is handled
 * by the L3 HomophoneDetectionRule.
 */
export class ConfusableKanjiRule extends AbstractLintRule {
  readonly id = "confusable-kanji";
  override engine: CorrectionEngine = "regex";
  readonly name = "Confusable kanji and common mistakes";
  readonly nameJa = "誤字・紛らわしい漢字・慣用句誤用の検出";
  readonly description =
    "Detects visually similar kanji confusion and misused expressions via a preset dictionary";
  readonly descriptionJa =
    "プリセット辞書で、形の似た漢字の混同・慣用句の誤用を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const pair of CONFUSABLE_PAIRS) {
      const pattern = new RegExp(escapeRegExp(pair.wrong), "g");

      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) continue;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Possible error: "${pair.wrong}" → "${pair.correct}"`,
          messageJa: pair.noteJa,
          from: match.index,
          to: match.index + pair.wrong.length,
          originalText: pair.wrong,
          reference: pair.ref,
          fix: {
            label: `Replace with "${pair.correct}"`,
            labelJa: `「${pair.correct}」に置換`,
            replacement: pair.correct,
          },
        });
      }
    }

    return issues;
  }
}

/**
 * Escapes special regex metacharacters in a literal string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
