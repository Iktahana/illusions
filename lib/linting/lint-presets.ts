import type { Severity } from "./types";
import type { CorrectionModeId, GuidelineId } from "./correction-config";

/** Static metadata for lint rules displayed in settings and inspector */
export interface LintRuleMeta {
  id: string;
  nameJa: string;
  descriptionJa: string;
  /** Whether this rule supports the skipDialogue toggle. False = toggle hidden in UI. */
  supportsSkipDialogue?: boolean;
  /** The guideline this rule belongs to. undefined = universal (always runs). */
  guidelineId?: GuidelineId;
  /**
   * Correction modes this rule belongs to. Switching to a listed mode enables
   * the rule; switching to a mode NOT listed disables it (strict membership).
   * An empty array means the rule is off in every mode (manual toggle only).
   */
  applicableModes: CorrectionModeId[];
}

export const LINT_RULES_META: LintRuleMeta[] = [
  // ---------------------------------------------------------------------------
  // JTF日本語標準スタイルガイド (21 implemented rules)
  // ---------------------------------------------------------------------------
  {
    id: "jtf-1-2-1",
    nameJa: "句読点の統一",
    descriptionJa:
      "句点（。）と読点（、）について、JTFスタイルガイドの基準に従って表記を統一します",
    guidelineId: "jtf-style-3",
    applicableModes: ["novel", "official", "blog", "academic"],
  },
  {
    id: "jtf-1-2-1-punctuation",
    nameJa: "句読点の全角統一",
    descriptionJa:
      "句読点には全角の「、」と「。」を使います。ピリオド（.）とカンマ（,）は使用しません",
    guidelineId: "jtf-style-3",
    applicableModes: ["novel", "official", "blog", "academic", "sns"],
  },
  {
    id: "jtf-3-1-1",
    nameJa: "句点（。）の用法",
    descriptionJa: "句点（。）について、JTFスタイルガイドの基準に従って表記を統一します",
    guidelineId: "jtf-style-3",
    applicableModes: ["novel", "official", "blog", "academic"],
  },
  {
    id: "jtf-3-1-1-kuten-brackets",
    nameJa: "閉じかっこ前の句点禁止",
    descriptionJa: "閉じかっこの前に句点（。）を打ちません",
    guidelineId: "jtf-style-3",
    applicableModes: ["novel", "official", "blog", "academic", "sns"],
  },
  {
    id: "jtf-3-1-3",
    nameJa: "ピリオド・カンマの用法",
    descriptionJa:
      "ピリオド（.）、カンマ（,）について、JTFスタイルガイドの基準に従って表記を統一します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-2-1-5-fullwidth-kana",
    nameJa: "カタカナの全角表記",
    descriptionJa: "漢字、ひらがな、カタカナは全角で表記します。半角カタカナは使用しません",
    guidelineId: "jtf-style-3",
    applicableModes: ["novel", "official", "blog", "academic", "sns"],
  },
  {
    id: "jtf-2-1-8",
    nameJa: "算用数字の表記",
    descriptionJa: "算用数字について、JTFスタイルガイドの基準に従って表記を統一します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-2-1-8-halfwidth-alnum",
    nameJa: "英数字の半角統一",
    descriptionJa: "算用数字とアルファベットは半角で表記します。全角の英数字は使用しません",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-2-1-10-digit-comma",
    nameJa: "算用数字の位取り",
    descriptionJa: "桁区切りには半角カンマ、小数点には半角ピリオドを使います",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-2-2-1-kanji",
    nameJa: "漢字表記の推奨",
    descriptionJa: "特定の副詞などは、ひらがなではなく漢字で表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-2-3-no-space",
    nameJa: "半角・全角間のスペース禁止",
    descriptionJa: "半角文字と全角文字の間に半角スペースを入れません",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-3-3-1-parentheses-space",
    nameJa: "かっこ内外のスペース禁止",
    descriptionJa: "かっこの外側、内側ともにスペースを入れません",
    guidelineId: "jtf-style-3",
    applicableModes: ["novel", "official", "blog", "academic"],
  },
  {
    id: "jtf-3-3-brackets-fullwidth",
    nameJa: "かっこの全角表記",
    descriptionJa: "丸かっこ、大かっこ、かぎかっこなどは原則として全角で表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["novel", "official", "blog", "academic"],
  },
  {
    id: "jtf-4-3-2",
    nameJa: "長さの単位表記",
    descriptionJa: "長さについて、SI単位（m、cm、mm、km）を正しく表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-4-3-3",
    nameJa: "質量の単位表記",
    descriptionJa: "質量について、SI単位（g、kg、t）を正しく表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-4-3-4",
    nameJa: "面積・体積の単位表記",
    descriptionJa: "面積、体積について、SI単位（m²、m³、L）を正しく表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-4-3-5",
    nameJa: "電気の単位表記",
    descriptionJa: "電気について、SI単位（V、A、W、Ω、Hz）を正しく表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-4-3-6",
    nameJa: "温度の単位表記",
    descriptionJa: "温度について、摂氏（℃）を正しく表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-4-3-7",
    nameJa: "周波数の単位表記",
    descriptionJa: "周波数について、SI単位（Hz、kHz、MHz、GHz）を正しく表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-4-3-8",
    nameJa: "速度の単位表記",
    descriptionJa: "速度について、SI単位（m/s、km/h）を正しく表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
  {
    id: "jtf-4-3-9",
    nameJa: "伝送速度の単位表記",
    descriptionJa: "伝送速度について、単位（bps、kbps、Mbps、Gbps）を正しく表記します",
    guidelineId: "jtf-style-3",
    applicableModes: ["official", "blog", "academic"],
  },
];

/** Category grouping for rule display */
export interface LintRuleCategory {
  id: string;
  nameJa: string;
  /** Author / publisher (出典の著者・発行元), shown dimmed after the title. */
  publisherJa?: string;
  /** License / copyright-policy name shown beside the pack name. */
  license?: string;
  /** Optional link to the license text. */
  licenseUrl?: string;
  /** Optional purchase link for packs derived from commercial physical books. */
  purchaseUrl?: string;
  rules: string[];
}

export const LINT_RULE_CATEGORIES: LintRuleCategory[] = [
  {
    id: "jtf",
    nameJa: "JTF日本語標準スタイルガイド",
    publisherJa: "日本翻訳連盟",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    rules: [
      "jtf-1-2-1",
      "jtf-1-2-1-punctuation",
      "jtf-3-1-1",
      "jtf-3-1-1-kuten-brackets",
      "jtf-3-1-3",
      "jtf-2-1-5-fullwidth-kana",
      "jtf-2-1-8",
      "jtf-2-1-8-halfwidth-alnum",
      "jtf-2-1-10-digit-comma",
      "jtf-2-2-1-kanji",
      "jtf-2-3-no-space",
      "jtf-3-3-1-parentheses-space",
      "jtf-3-3-brackets-fullwidth",
      "jtf-4-3-2",
      "jtf-4-3-3",
      "jtf-4-3-4",
      "jtf-4-3-5",
      "jtf-4-3-6",
      "jtf-4-3-7",
      "jtf-4-3-8",
      "jtf-4-3-9",
    ],
  },
];

/** Per-rule config shape used in presets and settings */
export interface LintRulePresetConfig {
  enabled: boolean;
  severity: Severity;
  skipDialogue?: boolean;
}

/** Default configs per rule -- used as standard mode */
export const LINT_DEFAULT_CONFIGS: Record<string, LintRulePresetConfig> = {
  // --- JTF rules ---
  "jtf-1-2-1": { enabled: true, severity: "warning" },
  "jtf-1-2-1-punctuation": { enabled: true, severity: "warning" },
  "jtf-3-1-1": { enabled: true, severity: "warning" },
  "jtf-3-1-1-kuten-brackets": { enabled: true, severity: "warning" },
  "jtf-3-1-3": { enabled: true, severity: "warning" },
  "jtf-2-1-5-fullwidth-kana": { enabled: true, severity: "warning" },
  "jtf-2-1-8": { enabled: true, severity: "warning" },
  "jtf-2-1-8-halfwidth-alnum": { enabled: true, severity: "warning" },
  "jtf-2-1-10-digit-comma": { enabled: true, severity: "warning" },
  "jtf-2-2-1-kanji": { enabled: true, severity: "info" },
  "jtf-2-3-no-space": { enabled: true, severity: "info" },
  "jtf-3-3-1-parentheses-space": { enabled: true, severity: "warning" },
  "jtf-3-3-brackets-fullwidth": { enabled: true, severity: "warning" },
  "jtf-4-3-2": { enabled: true, severity: "warning" },
  "jtf-4-3-3": { enabled: true, severity: "warning" },
  "jtf-4-3-4": { enabled: true, severity: "warning" },
  "jtf-4-3-5": { enabled: true, severity: "warning" },
  "jtf-4-3-6": { enabled: true, severity: "warning" },
  "jtf-4-3-7": { enabled: true, severity: "warning" },
  "jtf-4-3-8": { enabled: true, severity: "warning" },
  "jtf-4-3-9": { enabled: true, severity: "warning" },
};

/** Preset configuration for one-shot application */
export interface LintPreset {
  nameJa: string;
  configs: Record<string, LintRulePresetConfig>;
}

export const LINT_PRESETS: Record<string, LintPreset> = {
  relaxed: {
    nameJa: "寛容モード",
    configs: {
      "jtf-1-2-1": { enabled: false, severity: "info" },
      "jtf-1-2-1-punctuation": { enabled: true, severity: "info" },
      "jtf-3-1-1": { enabled: false, severity: "info" },
      "jtf-3-1-1-kuten-brackets": { enabled: true, severity: "info" },
      "jtf-3-1-3": { enabled: false, severity: "info" },
      "jtf-2-1-5-fullwidth-kana": { enabled: true, severity: "info" },
      "jtf-2-1-8": { enabled: false, severity: "info" },
      "jtf-2-1-8-halfwidth-alnum": { enabled: false, severity: "info" },
      "jtf-2-1-10-digit-comma": { enabled: false, severity: "info" },
      "jtf-2-2-1-kanji": { enabled: false, severity: "info" },
      "jtf-2-3-no-space": { enabled: false, severity: "info" },
      "jtf-3-3-1-parentheses-space": { enabled: false, severity: "info" },
      "jtf-3-3-brackets-fullwidth": { enabled: false, severity: "info" },
      "jtf-4-3-2": { enabled: false, severity: "info" },
      "jtf-4-3-3": { enabled: false, severity: "info" },
      "jtf-4-3-4": { enabled: false, severity: "info" },
      "jtf-4-3-5": { enabled: false, severity: "info" },
      "jtf-4-3-6": { enabled: false, severity: "info" },
      "jtf-4-3-7": { enabled: false, severity: "info" },
      "jtf-4-3-8": { enabled: false, severity: "info" },
      "jtf-4-3-9": { enabled: false, severity: "info" },
    },
  },
  standard: {
    nameJa: "標準モード",
    configs: { ...LINT_DEFAULT_CONFIGS },
  },
  strict: {
    nameJa: "厳密モード",
    configs: {
      "jtf-1-2-1": { enabled: true, severity: "error" },
      "jtf-1-2-1-punctuation": { enabled: true, severity: "error" },
      "jtf-3-1-1": { enabled: true, severity: "error" },
      "jtf-3-1-1-kuten-brackets": { enabled: true, severity: "error" },
      "jtf-3-1-3": { enabled: true, severity: "error" },
      "jtf-2-1-5-fullwidth-kana": { enabled: true, severity: "error" },
      "jtf-2-1-8": { enabled: true, severity: "error" },
      "jtf-2-1-8-halfwidth-alnum": { enabled: true, severity: "error" },
      "jtf-2-1-10-digit-comma": { enabled: true, severity: "error" },
      "jtf-2-2-1-kanji": { enabled: true, severity: "warning" },
      "jtf-2-3-no-space": { enabled: true, severity: "warning" },
      "jtf-3-3-1-parentheses-space": { enabled: true, severity: "error" },
      "jtf-3-3-brackets-fullwidth": { enabled: true, severity: "error" },
      "jtf-4-3-2": { enabled: true, severity: "error" },
      "jtf-4-3-3": { enabled: true, severity: "error" },
      "jtf-4-3-4": { enabled: true, severity: "error" },
      "jtf-4-3-5": { enabled: true, severity: "error" },
      "jtf-4-3-6": { enabled: true, severity: "error" },
      "jtf-4-3-7": { enabled: true, severity: "error" },
      "jtf-4-3-8": { enabled: true, severity: "error" },
      "jtf-4-3-9": { enabled: true, severity: "error" },
    },
  },
  novel: {
    nameJa: "小説モード",
    configs: {
      "jtf-1-2-1": { enabled: true, severity: "warning" },
      "jtf-1-2-1-punctuation": { enabled: true, severity: "warning" },
      "jtf-3-1-1": { enabled: true, severity: "info" },
      "jtf-3-1-1-kuten-brackets": { enabled: true, severity: "warning" },
      "jtf-3-1-3": { enabled: false, severity: "info" },
      "jtf-2-1-5-fullwidth-kana": { enabled: true, severity: "warning" },
      "jtf-2-1-8": { enabled: false, severity: "info" },
      "jtf-2-1-8-halfwidth-alnum": { enabled: false, severity: "info" },
      "jtf-2-1-10-digit-comma": { enabled: false, severity: "info" },
      "jtf-2-2-1-kanji": { enabled: false, severity: "info" },
      "jtf-2-3-no-space": { enabled: false, severity: "info" },
      "jtf-3-3-1-parentheses-space": { enabled: true, severity: "info" },
      "jtf-3-3-brackets-fullwidth": { enabled: true, severity: "info" },
      "jtf-4-3-2": { enabled: false, severity: "info" },
      "jtf-4-3-3": { enabled: false, severity: "info" },
      "jtf-4-3-4": { enabled: false, severity: "info" },
      "jtf-4-3-5": { enabled: false, severity: "info" },
      "jtf-4-3-6": { enabled: false, severity: "info" },
      "jtf-4-3-7": { enabled: false, severity: "info" },
      "jtf-4-3-8": { enabled: false, severity: "info" },
      "jtf-4-3-9": { enabled: false, severity: "info" },
    },
  },
};

// ---------------------------------------------------------------------------
// Mode-based preset generation
// ---------------------------------------------------------------------------

import { CORRECTION_MODES, MODE_TO_PRESET } from "./correction-modes";

/**
 * Generate a LintPreset from a correction mode by merging the mode's
 * ruleOverrides on top of the standard (default) preset configs.
 */
export function getPresetForMode(modeId: CorrectionModeId): LintPreset {
  const mode = CORRECTION_MODES[modeId];
  const base = { ...LINT_DEFAULT_CONFIGS };

  const merged: Record<string, LintRulePresetConfig> = { ...base };
  for (const [ruleId, override] of Object.entries(mode.ruleOverrides)) {
    const existing = merged[ruleId] ?? { enabled: true, severity: "warning" as const };
    merged[ruleId] = { ...existing, ...override } as LintRulePresetConfig;
  }

  return {
    nameJa: mode.nameJa,
    configs: merged,
  };
}

/**
 * Build the effective per-rule config map for a correction mode.
 *
 * Strict membership: a rule's `enabled` is decided solely by whether the mode
 * is in its `applicableModes` (see {@link LintRuleMeta.applicableModes}); its
 * severity comes from the mode's preset (or the default config as a fallback).
 * This is the single source applied on mode switch by every call site.
 */
export function buildModeRuleConfigs(
  modeId: CorrectionModeId,
): Record<string, LintRulePresetConfig> {
  const preset = LINT_PRESETS[MODE_TO_PRESET[modeId]];
  const base = preset ? preset.configs : LINT_DEFAULT_CONFIGS;

  const out: Record<string, LintRulePresetConfig> = {};
  for (const meta of LINT_RULES_META) {
    const baseCfg = base[meta.id] ??
      LINT_DEFAULT_CONFIGS[meta.id] ?? { enabled: false, severity: "info" as const };
    out[meta.id] = { ...baseCfg, enabled: meta.applicableModes.includes(modeId) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Guideline map export
// ---------------------------------------------------------------------------

/**
 * Map from rule ID to its GuidelineId (or undefined for universal rules).
 * Used by RuleRunner for guideline-based filtering.
 */
export const RULE_GUIDELINE_MAP: Map<string, GuidelineId | undefined> = new Map(
  LINT_RULES_META.map((rule) => [rule.id, rule.guidelineId]),
);
