/**
 * Enhanced Japanese readability analysis.
 *
 * 2-tier architecture:
 *   Tier 1 (surface): synchronous, regex-based — always available
 *   Tier 2 (morphological): async via INlpClient — enriches Tier 1 result
 *
 * Usage:
 *   const base = analyzeReadability(cleanText);
 *   // optional: enrich with kuromoji
 *   const tokens = await nlpClient.tokenizeParagraph(cleanText);
 *   const enhanced = enrichReadabilityWithMorphology(base, tokens);
 */

import { MdiDocument } from "@/packages/milkdown-plugin-japanese-novel/mdi-document";
import type { Token } from "@/lib/nlp-client/types";
import type { DictLookup } from "@/lib/dict/dict-types";
import type {
  EnhancedReadabilityAnalysis,
  ParagraphMetrics,
  ReadabilitySubScores,
  SentenceLengthMetrics,
  SyntaxMetrics,
  VocabularyMetrics,
} from "./readability-types";

/**
 * 文字数カウント用にMarkdownを整形する
 *
 * `[[blank]]` マーカー行は `MdiDocument.toAnalysisText()` で除去してから
 * Markdown 記法を取り除く（#1483 で導入された挙動。#1234 のリライトで
 * 呼び出しが脱落していたため #1449 で復元）。
 */
export function cleanMarkdown(markdown: string): string {
  return MdiDocument.fromRawText(markdown)
    .toAnalysisText()
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*_]{3,}$/gm, "")
    .trim();
}

// ── Constants ──────────────────────────────────────────────────────────────

/** 接続詞で始まる文を検出する正規表現 */
const CONJUNCTION_RE =
  /^(しかし|ただし|また|さらに|そして|なお|一方|ところが|それにもかかわらず|とはいえ|もっとも|したがって|それゆえ|そのため|なぜなら|つまり|すなわち|例えば|特に|ところで|あるいは|もしくは|または)/;

/** 二重否定パターン */
const DOUBLE_NEGATIVE_PATTERNS = [
  /ないわけではな[いく]/,
  /ないことはな[いく]/,
  /なくはな[いく]/,
  /ないとも言えな[いく]/,
  /ないとは言えな[いく]/,
  /なくもな[いく]/,
];

/** 句読点文字（間隔計算用）*/
const PUNCTUATION_RE = /[、。！？]/;

/** 括弧の開き文字 */
const BRACKET_OPEN = new Set([..."（(【「『〔〈《"]);
/** 括弧の閉じ文字 */
const BRACKET_CLOSE = new Set([..."）)】」』〕〉》"]);

// ── Utility functions ──────────────────────────────────────────────────────

/** 文末で分割し、空の文を除去する */
function splitSentences(text: string): string[] {
  return text.split(/[。！？]/).filter((s) => s.trim().length > 0);
}

/** 段落に分割する */
function splitParagraphs(text: string): string[] {
  return text.split(/\n+/).filter((p) => p.trim().length > 0);
}

/** ソート済み配列のパーセンタイル値 */
function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * ratio) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/** 分散を返す */
function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
}

/** 括弧ネストの最大深さ */
function calcMaxBracketDepth(text: string): number {
  let depth = 0;
  let max = 0;
  for (const ch of text) {
    if (BRACKET_OPEN.has(ch)) {
      depth++;
      max = Math.max(max, depth);
    } else if (BRACKET_CLOSE.has(ch)) {
      depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

/** 20字超の括弧内テキスト数をカウントする */
function calcLongBracketCount(text: string): number {
  // （...）「...」など — 長い括弧内容を検出
  const matches = text.match(/[（(【「『〔〈《][^）)】」』〕〉》]{20,}[）)】」』〕〉》]/g);
  return matches?.length ?? 0;
}

/** 平均句読点間隔を算出する */
function calcAvgPunctuationSpacing(text: string): number {
  const indices: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (PUNCTUATION_RE.test(text[i])) indices.push(i);
  }
  if (indices.length <= 1) return 0;
  let total = 0;
  for (let i = 1; i < indices.length; i++) {
    total += indices[i] - indices[i - 1];
  }
  return Math.round((total / (indices.length - 1)) * 10) / 10;
}

/** 漢字連続列（≥4文字 / ≥6文字）の統計を返す */
function analyzeKanjiRuns(
  text: string,
  totalChars: number,
): { density: number; longRunCount: number } {
  const runs = text.match(/[\u4E00-\u9FFF]{2,}/g) ?? [];
  const mediumRuns = runs.filter((r) => r.length >= 4);
  const longRuns = runs.filter((r) => r.length >= 6);
  const density = totalChars > 0 ? (mediumRuns.length / totalChars) * 100 : 0;
  return { density, longRunCount: longRuns.length };
}

// ── Sub-score calculators ──────────────────────────────────────────────────

/** 文の負荷スコア（0〜100）を算出する */
function calcSentenceLoadScore(m: SentenceLengthMetrics): number {
  let score = 100;

  // 平均文長
  if (m.avg > 45) score -= 20;
  else if (m.avg > 35) score -= 12;
  else if (m.avg > 25) score -= 5;
  else if (m.avg >= 15 && m.avg <= 25) score += 5;

  // P90文長
  if (m.p90 > 80) score -= 15;
  else if (m.p90 > 60) score -= 8;
  else if (m.p90 > 45) score -= 5;

  // 最大文長
  if (m.max > 100) score -= 10;

  // 長文比率
  if (m.longRatio > 0.5) score -= 20;
  else if (m.longRatio > 0.3) score -= 12;
  else if (m.longRatio > 0.2) score -= 5;

  // 分散（標準偏差）
  if (Math.sqrt(m.variance) > 20) score -= 5;

  return Math.max(0, Math.min(100, score));
}

/** 語彙の難しさスコア（0〜100）を算出する */
function calcVocabularyScore(m: VocabularyMetrics): number {
  let score = 100;

  // 漢字率
  if (m.kanjiRate > 50) score -= 18;
  else if (m.kanjiRate > 35) score -= 8;
  else if (m.kanjiRate < 15) score -= 5;
  else if (m.kanjiRate >= 20 && m.kanjiRate <= 32) score += 5;

  // カタカナ率
  if (m.katakanaRate > 25) score -= 12;
  else if (m.katakanaRate > 15) score -= 5;

  // 漢字連続列
  if (m.kanjiRunDensity > 1) score -= 8;
  else if (m.kanjiRunDensity > 0.5) score -= 4;
  score -= Math.min(12, m.longKanjiRunCount * 3);

  // kuromoji: 名詞連接
  if (m.nounChainCount !== undefined) {
    score -= Math.min(10, m.nounChainCount * 2);
  }
  // kuromoji: 固有名詞密度
  if (m.properNounRate !== undefined && m.properNounRate > 0.25) {
    score -= 8;
  }
  // kuromoji: TTR（語彙多様性）
  if (m.ttr !== undefined) {
    if (m.ttr < 0.3)
      score -= 8; // 語彙が単調
    else if (m.ttr > 0.85) score -= 5; // 専門語過多
  }

  return Math.max(0, Math.min(100, score));
}

/** 構文の複雑さスコア（0〜100）を算出する */
function calcSyntaxScore(m: SyntaxMetrics): number {
  let score = 100;

  // 括弧ネスト
  if (m.maxBracketDepth >= 3) score -= 15;
  else if (m.maxBracketDepth >= 2) score -= 5;

  // 長い括弧内容
  score -= Math.min(12, m.longBracketCount * 3);

  // 接続詞率
  if (m.conjunctionRate > 0.4) score -= 15;
  else if (m.conjunctionRate > 0.25) score -= 8;

  // 二重否定
  score -= Math.min(15, m.doubleNegativeCount * 5);

  // 句読点間隔
  if (m.avgPunctuationSpacing > 20) score -= 15;
  else if (m.avgPunctuationSpacing > 15) score -= 8;
  else if (m.avgPunctuationSpacing >= 8 && m.avgPunctuationSpacing <= 12) score += 5;

  // kuromoji: 受け身
  if (m.passiveRate !== undefined) {
    if (m.passiveRate > 0.5) score -= 15;
    else if (m.passiveRate > 0.3) score -= 8;
  }
  // kuromoji: 使役
  if (m.causativeRate !== undefined && m.causativeRate > 0.15) {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

/** 段落密度スコア（0〜100）を算出する */
function calcParagraphScore(m: ParagraphMetrics): number {
  let score = 100;

  if (m.avgLength > 300) score -= 12;
  else if (m.avgLength > 200) score -= 5;
  else if (m.avgLength >= 80 && m.avgLength <= 180) score += 5;

  // 長段落比率
  if (m.longRatio > 0.3) score -= 8;

  // 標準偏差が大きい（一部の段落だけ突出して長い）
  if (Math.sqrt(m.variance) > 150) score -= 5;

  return Math.max(0, Math.min(100, score));
}

/** サブスコアを加重合成して総合スコアを返す */
function compositeScore(sub: ReadabilitySubScores): number {
  return Math.round(
    sub.sentenceLoad * 0.3 +
      sub.vocabulary * 0.3 +
      sub.syntaxComplexity * 0.25 +
      sub.paragraphDensity * 0.15,
  );
}

/** スコアからレベルを決定する */
function scoreToLevel(score: number): "easy" | "normal" | "difficult" {
  if (score >= 75) return "easy";
  if (score >= 50) return "normal";
  return "difficult";
}

// ── Main analysis functions ────────────────────────────────────────────────

/**
 * 表層分析のみで可読性を評価する（同期・kuromoji不要）。
 * テキストは事前に `cleanMarkdown()` 等で前処理済みのものを渡すこと。
 *
 * @param rawText - エディタの生コンテンツ（Markdown/MDI記法を含む可能性あり）
 */
export function analyzeReadability(rawText: string): EnhancedReadabilityAnalysis {
  // 必ずMarkdownを除去してから分析する
  const text = cleanMarkdown(rawText);

  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const totalChars = text.replace(/\s/g, "").length || 1;

  // ── 文長指標 ──────────────────────────────────────────
  const rawLengths = sentences.map((s) => s.replace(/\s/g, "").length);
  const sortedLengths = [...rawLengths].sort((a, b) => a - b);
  const avgSentenceLength =
    sentences.length > 0 ? Math.round((totalChars / sentences.length) * 10) / 10 : 0;

  const sentenceMetrics: SentenceLengthMetrics = {
    avg: avgSentenceLength,
    p90: percentile(sortedLengths, 0.9),
    max: sortedLengths[sortedLengths.length - 1] ?? 0,
    longRatio: rawLengths.filter((l) => l > 50).length / (sentences.length || 1),
    variance: variance(rawLengths),
  };

  // ── 語彙指標 ──────────────────────────────────────────
  let kanjiCount = 0;
  let katakanaCount = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= 0x4e00 && c <= 0x9fff) kanjiCount++;
    else if (c >= 0x30a0 && c <= 0x30ff) katakanaCount++;
  }
  const kanjiRuns = analyzeKanjiRuns(text, totalChars);

  const vocabMetrics: VocabularyMetrics = {
    kanjiRate: (kanjiCount / totalChars) * 100,
    katakanaRate: (katakanaCount / totalChars) * 100,
    kanjiRunDensity: kanjiRuns.density,
    longKanjiRunCount: kanjiRuns.longRunCount,
  };

  // ── 構文指標 ──────────────────────────────────────────
  const doubleNegativeCount = DOUBLE_NEGATIVE_PATTERNS.reduce(
    (n, p) => n + (text.match(p)?.length ?? 0),
    0,
  );
  const conjunctionMatchCount = sentences.filter((s) => CONJUNCTION_RE.test(s.trim())).length;

  const syntaxMetrics: SyntaxMetrics = {
    maxBracketDepth: calcMaxBracketDepth(text),
    longBracketCount: calcLongBracketCount(text),
    conjunctionRate: sentences.length > 0 ? conjunctionMatchCount / sentences.length : 0,
    doubleNegativeCount,
    avgPunctuationSpacing: calcAvgPunctuationSpacing(text),
  };

  // ── 段落指標 ──────────────────────────────────────────
  const paraLengths = paragraphs.map((p) => p.replace(/\s/g, "").length);

  const paragraphMetrics: ParagraphMetrics = {
    avgLength: paragraphs.length > 0 ? totalChars / paragraphs.length : 0,
    variance: variance(paraLengths),
    longRatio: paraLengths.filter((l) => l > 300).length / (paragraphs.length || 1),
  };

  // ── サブスコア ─────────────────────────────────────────
  const subScores: ReadabilitySubScores = {
    sentenceLoad: calcSentenceLoadScore(sentenceMetrics),
    vocabulary: calcVocabularyScore(vocabMetrics),
    // NLPなし時は固定値75（中程度の複雑さを仮定）
    syntaxComplexity: calcSyntaxScore(syntaxMetrics),
    paragraphDensity: calcParagraphScore(paragraphMetrics),
  };

  const score = Math.max(0, Math.min(100, compositeScore(subScores)));

  return {
    score,
    level: scoreToLevel(score),
    subScores,
    detail: {
      sentence: sentenceMetrics,
      vocabulary: vocabMetrics,
      syntax: syntaxMetrics,
      paragraph: paragraphMetrics,
    },
    avgSentenceLength,
    avgPunctuationSpacing: syntaxMetrics.avgPunctuationSpacing,
    hasMorphologicalAnalysis: false,
    hasDictAnalysis: false,
  };
}

/**
 * kuromoji の形態素解析結果で可読性評価を補強する。
 * `analyzeReadability()` の結果を受け取り、NLP指標を追加して再スコアリングする。
 *
 * @param base - `analyzeReadability()` の結果
 * @param tokens - `INlpClient.tokenizeParagraph()` または `tokenizeDocument()` の結果
 */
export function enrichReadabilityWithMorphology(
  base: EnhancedReadabilityAnalysis,
  tokens: Token[],
): EnhancedReadabilityAnalysis {
  const nouns = tokens.filter((t) => t.pos === "名詞");
  const verbs = tokens.filter((t) => t.pos === "動詞");
  const contentWords = tokens.filter((t) => ["名詞", "動詞", "形容詞", "副詞"].includes(t.pos));

  // 名詞連接（3個以上の連続名詞 token）
  let nounChainCount = 0;
  let chainLen = 0;
  for (const t of tokens) {
    if (t.pos === "名詞") {
      chainLen++;
    } else {
      if (chainLen >= 3) nounChainCount++;
      chainLen = 0;
    }
  }
  if (chainLen >= 3) nounChainCount++;

  // 固有名詞密度
  const properNounCount = nouns.filter((t) => t.pos_detail_1 === "固有名詞").length;
  const properNounRate = tokens.length > 0 ? properNounCount / tokens.length : 0;

  // TTR（type-token ratio）
  const uniqueLemmas = new Set(contentWords.map((t) => t.basic_form ?? t.surface));
  // コンテンツ語がない場合は undefined（スコアリングをスキップ）
  const ttr = contentWords.length > 0 ? uniqueLemmas.size / contentWords.length : undefined;

  // 受け身動詞（〜れる/〜られる の表層形）
  const passiveTokens = verbs.filter(
    (t) => t.surface.endsWith("れる") || t.surface.endsWith("られる"),
  ).length;
  const passiveRate = verbs.length > 0 ? passiveTokens / verbs.length : undefined;

  // 使役動詞（〜せる/〜させる の表層形）
  const causativeTokens = verbs.filter(
    (t) => t.surface.endsWith("せる") || t.surface.endsWith("させる"),
  ).length;
  const causativeRate = verbs.length > 0 ? causativeTokens / verbs.length : undefined;

  const enrichedVocab: VocabularyMetrics = {
    ...base.detail.vocabulary,
    nounChainCount,
    properNounRate,
    ttr,
  };
  const enrichedSyntax: SyntaxMetrics = {
    ...base.detail.syntax,
    passiveRate,
    causativeRate,
  };

  const newSubScores: ReadabilitySubScores = {
    ...base.subScores,
    vocabulary: calcVocabularyScore(enrichedVocab),
    syntaxComplexity: calcSyntaxScore(enrichedSyntax),
  };

  const score = Math.max(0, Math.min(100, compositeScore(newSubScores)));

  return {
    ...base,
    score,
    level: scoreToLevel(score),
    subScores: newSubScores,
    detail: {
      ...base.detail,
      vocabulary: enrichedVocab,
      syntax: enrichedSyntax,
    },
    hasMorphologicalAnalysis: true,
    hasDictAnalysis: base.hasDictAnalysis,
  };
}

// ── Tier 3: Dictionary-based enrichment ───────────────────────────────────

/**
 * 幻辞 freq_rank を利用した語彙難易度算出の閾値・重み定数。
 *
 * 根拠:
 *   Genji corpus は約 50 万語収録（推定）。freq_rank 1〜10,000 が一般語（常用〜準常用）、
 *   10,001〜50,000 が準稀少語、50,001 以上が稀少語と大雑把に分類できる。
 *   「稀少語率」は小説における語彙の難度に直接影響する指標（JIS X 4051 準拠評価や
 *   文化庁「公用文作成の考え方」（2022）が「平易な語の選択」を求める背景から妥当）。
 *
 *   スコア補正: 稀少語率（と補助的に平均 freq_rank）が高いほど語彙スコアを下げる。
 *   - 稀少語率 > 0.4 → -25 pt（難語が支配的）
 *   - 稀少語率 0.3〜0.4 → -18 pt
 *   - 稀少語率 0.2〜0.3 → -12 pt
 *   - 稀少語率 0.1〜0.2 → -6 pt
 *   - 稀少語率 0.05〜0.1 → -3 pt
 *   - 平均 freq_rank > 15,000 → 追加 -8 pt
 *   - 平均 freq_rank 8,000〜15,000 → 追加 -4 pt
 *   - 平均 freq_rank < 2,000（平易語が多い）→ +5 pt ボーナス
 */
// 「稀少」の判定境界。語彙統計パネルの 稀少 バケット（FREQ_RANK_GENERAL = 10,000）と
// 揃える。以前は 50,000 と過度に厳しく、稀少語が多い文章でもスコアがほぼ動かなかった（#1639）。
const RARE_THRESHOLD = 10_000;

/**
 * 幻辞（Genji）の freq_rank バッチ照合結果で語彙難易度サブスコアを補強する（Tier 3）。
 *
 * 純関数: 副作用なし。`getDictAccess()` の呼び出し・グレースフル劣化判断は呼び出し元が行う。
 * `hasMorphologicalAnalysis` 付きの結果にも重ねがけ可能。
 *
 * @param base      - Tier 1 または Tier 2 の分析結果
 * @param tokens    - kuromoji トークン配列（内容語の basic_form 抽出に使用）。
 *                    Tier 1 のみの場合は空配列を渡すと基本形フォールバック動作。
 * @param lookupMap - `DictAccess.lookupBatch()` が返す Map<headword, DictLookup>
 * @returns 語彙サブスコアと detail.vocabulary を幻辞情報で補正した新しい分析結果
 */
export function enrichReadabilityWithDict(
  base: EnhancedReadabilityAnalysis,
  tokens: Token[],
  lookupMap: Map<string, DictLookup>,
): EnhancedReadabilityAnalysis {
  if (lookupMap.size === 0) {
    // 照合結果が空: hasDictAnalysis=true にして返す（呼び出し元が "ready" を確認済み）
    return { ...base, hasDictAnalysis: true };
  }

  // 内容語の basic_form を収集（kuromoji トークン有り優先、なければ lookupMap のキーを使用）
  const contentForms: string[] =
    tokens.length > 0
      ? tokens
          .filter((t) => ["名詞", "動詞", "形容詞", "副詞"].includes(t.pos))
          .map((t) => t.basic_form ?? t.surface)
      : [...lookupMap.keys()];

  // ヒットした内容語の freq_rank を収集
  const freqRanks: number[] = [];
  let rareCount = 0;

  for (const form of contentForms) {
    const lookup = lookupMap.get(form);
    if (lookup?.found && lookup.freqRank !== undefined) {
      freqRanks.push(lookup.freqRank);
      if (lookup.freqRank > RARE_THRESHOLD) rareCount++;
    }
  }

  if (freqRanks.length === 0) {
    // 内容語が1件もヒットしない（辞書外文章等）: フラグだけ立てて返す
    return { ...base, hasDictAnalysis: true };
  }

  const avgFreqRank = Math.round(freqRanks.reduce((a, b) => a + b, 0) / freqRanks.length);
  const rareWordRate = rareCount / freqRanks.length;

  // 語彙スコア補正: 稀少語率を主シグナル、平均 freq_rank を補助シグナルとして
  // ペナルティ/ボーナスを加算。平均は高頻度の機能語・常用語に引っ張られて鈍いため、
  // 稀少語率に重みを置く（#1639）。
  let vocabDelta = 0;

  if (rareWordRate > 0.4) vocabDelta -= 25;
  else if (rareWordRate > 0.3) vocabDelta -= 18;
  else if (rareWordRate > 0.2) vocabDelta -= 12;
  else if (rareWordRate > 0.1) vocabDelta -= 6;
  else if (rareWordRate > 0.05) vocabDelta -= 3;

  if (avgFreqRank > 15_000) vocabDelta -= 8;
  else if (avgFreqRank > 8_000) vocabDelta -= 4;
  else if (avgFreqRank < 2_000) vocabDelta += 5;

  const newVocabScore = Math.max(0, Math.min(100, base.subScores.vocabulary + vocabDelta));

  const enrichedVocab: VocabularyMetrics = {
    ...base.detail.vocabulary,
    avgFreqRank,
    rareWordRate,
  };

  const newSubScores: ReadabilitySubScores = {
    ...base.subScores,
    vocabulary: newVocabScore,
  };

  const score = Math.max(0, Math.min(100, compositeScore(newSubScores)));

  return {
    ...base,
    score,
    level: scoreToLevel(score),
    subScores: newSubScores,
    detail: {
      ...base.detail,
      vocabulary: enrichedVocab,
    },
    hasDictAnalysis: true,
  };
}
