/**
 * Enhanced readability analysis types for Japanese text.
 *
 * 4-dimensional sub-score model:
 *  - sentenceLoad:     文の負荷（文長分布・括弧・句読点配置）
 *  - vocabulary:       語彙の難しさ（漢字連接・カタカナ密度）
 *  - syntaxComplexity: 構文の複雑さ（接続詞・二重否定・受け身）
 *  - paragraphDensity: 段落密度（長段落の割合）
 */

/** 文の長さに関する統計 */
export interface SentenceLengthMetrics {
  avg: number;
  /** 90パーセンタイル文長 */
  p90: number;
  max: number;
  /** 50字超の文の割合 */
  longRatio: number;
  /** 分散 */
  variance: number;
}

/** 語彙に関する指標 */
export interface VocabularyMetrics {
  /** 漢字率（%）*/
  kanjiRate: number;
  /** カタカナ率（%）*/
  katakanaRate: number;
  /** ≥4文字の漢字連続列の密度（件/100字） */
  kanjiRunDensity: number;
  /** ≥6文字の漢字連続列の数 */
  longKanjiRunCount: number;
  /** kuromoji使用時のみ有効: 連続名詞列（≥3）の数 */
  nounChainCount?: number;
  /** kuromoji使用時のみ有効: 固有名詞token / 全token */
  properNounRate?: number;
  /** kuromoji使用時のみ有効: type-token ratio（内容語） */
  ttr?: number;
}

/** 構文に関する指標 */
export interface SyntaxMetrics {
  /** 括弧ネストの最大深さ */
  maxBracketDepth: number;
  /** 20字超の括弧内テキストの数 */
  longBracketCount: number;
  /** 接続詞で始まる文の割合 */
  conjunctionRate: number;
  /** 二重否定パターンの出現数 */
  doubleNegativeCount: number;
  /** 平均句読点間隔 */
  avgPunctuationSpacing: number;
  /** kuromoji使用時のみ有効: 受け身動詞 / 全動詞 */
  passiveRate?: number;
  /** kuromoji使用時のみ有効: 使役動詞 / 全動詞 */
  causativeRate?: number;
}

/** 段落に関する指標 */
export interface ParagraphMetrics {
  /** 平均段落長（文字数）*/
  avgLength: number;
  /** 分散 */
  variance: number;
  /** 300字超の段落の割合 */
  longRatio: number;
}

/** 4つのサブスコア（各0〜100、高いほど読みやすい）*/
export interface ReadabilitySubScores {
  /** 文の負荷 */
  sentenceLoad: number;
  /** 語彙の難しさ */
  vocabulary: number;
  /** 構文の複雑さ（NLPなし時は固定値75）*/
  syntaxComplexity: number;
  /** 段落密度 */
  paragraphDensity: number;
}

/**
 * 拡張可読性分析結果。
 * `ReadabilityAnalysis`（lib/utils/index.ts）の上位互換。
 */
export interface EnhancedReadabilityAnalysis {
  /** 総合スコア（0〜100、高いほど読みやすい）*/
  score: number;
  /** 難易度レベル: ≥75=easy / 50〜74=normal / <50=difficult */
  level: "easy" | "normal" | "difficult";
  /** 4つのサブスコア */
  subScores: ReadabilitySubScores;
  /** 詳細指標（デバッグ・拡張UI用）*/
  detail: {
    sentence: SentenceLengthMetrics;
    vocabulary: VocabularyMetrics;
    syntax: SyntaxMetrics;
    paragraph: ParagraphMetrics;
  };
  /** 後方互換フィールド（既存UIが依存）*/
  avgSentenceLength: number;
  /** 後方互換フィールド（既存UIが依存）*/
  avgPunctuationSpacing: number;
  /** kuromoji形態素分析が反映されているか */
  hasMorphologicalAnalysis: boolean;
}
