/**
 * illusions エディタ用のユーティリティ
 */

/**
 * 文字数から原稿用紙枚数を算出する
 * 原稿用紙: 400字/枚
 */
export function calculateManuscriptPages(charCount: number): number {
  return Math.ceil(charCount / 400);
}

/**
 * 単語数を数える（日本語/英語の混在を想定）
 */
export function countWords(text: string): number {
  // Markdown記法をざっくり除去
  const plainText = text
    .replace(/[#*_~`\[\]()]/g, '')
    .trim();
  
  // 空白で分割し、空要素を除外
  const words = plainText.split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * 空白を除いた文字数を数える
 */
export function countCharacters(text: string): number {
  return text.replace(/\s/g, '').length;
}

/**
 * 表示用に日付を整形する（日本語ロケール）
 */
export function formatDate(date: Date): string {
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 相対時間を整形する（例: "3分前"）
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return '今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${Math.floor(diff / 86400)}日前`;
}

/**
 * 自動保存などに使うデバウンス
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * 文書用のユニークIDを生成する
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 日本語（ひらがな/カタカナ/漢字）を含むか判定する
 */
export function hasJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

/**
 * タイトルを検証する
 */
export function validateTitle(title: string): { valid: boolean; error?: string } {
  if (!title || title.trim().length === 0) {
    return { valid: false, error: 'タイトルを入力してください' };
  }
  if (title.length > 100) {
    return { valid: false, error: 'タイトルは100文字以内にしてください' };
  }
  return { valid: true };
}

/**
 * 文字数カウント用にMarkdownを整形する
 */
export function cleanMarkdown(markdown: string): string {
  return markdown
    // コードブロックを除去
    .replace(/```[\s\S]*?```/g, '')
    // インラインコードを除去
    .replace(/`[^`]+`/g, '')
    // リンクはテキストだけ残す
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // 画像を除去
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
    // 見出し記号を除去
    .replace(/^#{1,6}\s+/gm, '')
    // 強調記号を除去
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    // 引用記号を除去
    .replace(/^>\s+/gm, '')
    // 罫線を除去
    .replace(/^[-*_]{3,}$/gm, '')
    .trim();
}

/**
 * 文字種別の分析結果
 */
export interface CharacterTypeAnalysis {
  kanji: number;        // 漢字
  hiragana: number;     // ひらがな
  katakana: number;     // カタカナ
  other: number;        // その他
  total: number;        // 合計
}

/**
 * 文字種別の使用率
 */
export interface CharacterUsageRates {
  kanjiRate: number;    // 漢字使用率（%）
  hiraganaRate: number; // ひらがな使用率（%）
  katakanaRate: number; // カタカナ使用率（%）
}

/**
 * 読みやすさ分析の結果
 */
export interface ReadabilityAnalysis {
  score: number;        // スコア（0-100）
  level: string;        // レベル（easy/normal/difficult）
  avgSentenceLength: number;     // 平均文長
  avgPunctuationSpacing: number; // 平均句読点間隔
}

/**
 * 日本語テキスト向けの詳細統計
 */
export interface AdvancedStatistics {
  sentenceCount: number;      // 文数
  characterTypeAnalysis: CharacterTypeAnalysis;
  usageRates: CharacterUsageRates;
  readability: ReadabilityAnalysis;
  particleAnalysis?: {
    duplicates: Array<{ particle: string; count: number }>;
  };
}

/**
 * テキスト統計
 */
export interface TextStatistics {
  wordCount: number;
  charCount: number;
  manuscriptPages: number;
  paragraphCount: number;
  hasJapanese: boolean;
  advanced?: AdvancedStatistics;
}

export function calculateStatistics(text: string): TextStatistics {
  const cleanedText = cleanMarkdown(text);
  const charCount = countCharacters(cleanedText);
  const wordCount = countWords(cleanedText);
  const manuscriptPages = calculateManuscriptPages(charCount);
  const paragraphCount = text.split(/\n\n+/).filter(Boolean).length;
  
  // 日本語テキスト向けの詳細統計
  const advanced: AdvancedStatistics = {
    sentenceCount: countSentences(cleanedText),
    characterTypeAnalysis: analyzeCharacterTypes(cleanedText),
    usageRates: calculateCharacterUsageRates(analyzeCharacterTypes(cleanedText)),
    readability: calculateReadabilityScore(cleanedText),
    particleAnalysis: analyzeParticleUsage(cleanedText),
  };

  return {
    wordCount,
    charCount,
    manuscriptPages,
    paragraphCount,
    hasJapanese: hasJapanese(text),
    advanced,
  };
}

/**
 * 見出しの内容からアンカーIDを生成する（URLエンコード）
 */
export function generateHeadingId(title: string): string {
  // Markdown記法を除去して整形
  const cleanTitle = title
    .replace(/[*_~`\[\]()]/g, '')
    .trim();
  
  // URLエンコード
  return encodeURIComponent(cleanTitle);
}

/**
 * Markdownの見出しから章情報を抽出する
 */
export interface Chapter {
  level: number;
  title: string;
  lineNumber: number;
  charOffset: number;
  anchorId?: string;
}

export function parseMarkdownChapters(markdown: string): Chapter[] {
  const lines = markdown.split('\n');
  const chapters: Chapter[] = [];
  let charOffset = 0;

  lines.forEach((line, lineNumber) => {
    // 見出しパターン: # タイトル, ## タイトル ...
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim();
      const anchorId = generateHeadingId(title);
      
      chapters.push({
        level,
        title,
        lineNumber,
        charOffset,
        anchorId,
      });
    }
    charOffset += line.length + 1; // 改行分（+1）
  });

  return chapters;
}

/**
 * 日本語の文数を数える
 * 文末: 。！？
 */
export function countSentences(text: string): number {
  // 日本語の句点で文を分割：。！？のいずれか
  const sentences = text.split(/[。！？]/);
  // 空の要素を除外し、最後の空白を削除
  return sentences.filter(s => s.trim().length > 0).length;
}

/**
 * 文字種別を分析する（日本語向け）
 */
export function analyzeCharacterTypes(text: string): CharacterTypeAnalysis {
  let kanji = 0;      // 漢字
  let hiragana = 0;   // ひらがな
  let katakana = 0;   // カタカナ
  let other = 0;      // その他

  for (const char of text) {
    const code = char.charCodeAt(0);
    
    // 漢字 (U+4E00 - U+9FFF)
    if (code >= 0x4e00 && code <= 0x9fff) {
      kanji++;
    }
    // ひらがな (U+3040 - U+309F)
    else if (code >= 0x3040 && code <= 0x309f) {
      hiragana++;
    }
    // カタカナ (U+30A0 - U+30FF)
    else if (code >= 0x30a0 && code <= 0x30ff) {
      katakana++;
    }
    // その他（記号、句読点、英字など）
    else {
      other++;
    }
  }

  const total = kanji + hiragana + katakana + other;

  return {
    kanji,
    hiragana,
    katakana,
    other,
    total,
  };
}

/**
 * 文字種別の使用率を算出する（%）
 */
export function calculateCharacterUsageRates(analysis: CharacterTypeAnalysis): CharacterUsageRates {
  const total = analysis.total || 1;

  return {
    kanjiRate: (analysis.kanji / total) * 100,
    hiraganaRate: (analysis.hiragana / total) * 100,
    katakanaRate: (analysis.katakana / total) * 100,
  };
}

/**
 * 句読点間隔の平均を算出する
 * 平均句読点間隔
 */
export function calculateAveragePunctuationSpacing(text: string): number {
  const punctuationIndices: number[] = [];
  
  // 日本語の句読点を検出：、。！？
  for (let i = 0; i < text.length; i++) {
    if (/[、。！？]/.test(text[i])) {
      punctuationIndices.push(i);
    }
  }

  if (punctuationIndices.length <= 1) {
    return 0;
  }

  // 句読点間の距離を計算
  let totalDistance = 0;
  for (let i = 1; i < punctuationIndices.length; i++) {
    totalDistance += punctuationIndices[i] - punctuationIndices[i - 1];
  }

  return Math.round(totalDistance / (punctuationIndices.length - 1) * 10) / 10;
}

/**
 * 読みやすさスコアを算出する
 * 文の長さ、文字種別、句読点の使い方などから推定する
 * 0〜100点（高いほど読みやすい）
 */
export function calculateReadabilityScore(text: string): ReadabilityAnalysis {
  const sentenceCount = countSentences(text);
  const charAnalysis = analyzeCharacterTypes(text);
  const totalChars = charAnalysis.total || 1;
  
  // 平均文長を計算
  const avgSentenceLength = sentenceCount > 0 
    ? Math.round((totalChars / sentenceCount) * 10) / 10 
    : 0;

  // 平均句読点間隔を計算
  const avgPunctuationSpacing = calculateAveragePunctuationSpacing(text);

  // スコア計算（複数の要因に基づく）
  let score = 100;

  // 1. 平均文長に基づく減点（長い文は読みにくい）
  // 理想的な文長：15-20字
  if (avgSentenceLength > 30) {
    score -= 20;
  } else if (avgSentenceLength > 25) {
    score -= 10;
  } else if (avgSentenceLength > 15 && avgSentenceLength <= 25) {
    score += 5; // ボーナス
  }

  // 2. 句読点間隔に基づく減点（間隔が長すぎると読みにくい）
  // 理想的な間隔：8-12字
  if (avgPunctuationSpacing > 20) {
    score -= 15;
  } else if (avgPunctuationSpacing > 15) {
    score -= 8;
  } else if (avgPunctuationSpacing >= 8 && avgPunctuationSpacing <= 12) {
    score += 5; // ボーナス
  }

  // 3. 漢字使用率に基づくスコア調整
  // 30-40%が理想的
  const kanjiRate = (charAnalysis.kanji / totalChars) * 100;
  if (kanjiRate < 20 || kanjiRate > 50) {
    score -= 10;
  } else if (kanjiRate >= 30 && kanjiRate <= 40) {
    score += 5; // ボーナス
  }

  // 4. ひらがなとカタカナのバランス
  const hiraganaRate = (charAnalysis.hiragana / totalChars) * 100;
  const katakanaRate = (charAnalysis.katakana / totalChars) * 100;
  
  // ひらがなが多いほど読みやすい
  if (hiraganaRate < 30) {
    score -= 5;
  } else if (hiraganaRate > 60) {
    score -= 8; // 漢字が少なすぎる
  }

  // スコアを0-100の範囲に正規化
  score = Math.max(0, Math.min(100, score));

  // レベルを決定
  let level: string;
  if (score >= 70) {
    level = 'easy';      // 読みやすい
  } else if (score >= 40) {
    level = 'normal';    // 普通
  } else {
    level = 'difficult'; // 読みにくい
  }

  return {
    score: Math.round(score),
    level,
    avgSentenceLength,
    avgPunctuationSpacing,
  };
}

/**
 * 助詞の重複を検出する
 * 例: 「のの」「にに」は不自然/誤りの可能性がある
 */
export function analyzeParticleUsage(text: string): { duplicates: Array<{ particle: string; count: number }> } {
  const particles = ['の', 'に', 'を', 'が', 'は', 'や', 'と', 'で', 'から', 'まで'];
  const duplicates: Array<{ particle: string; count: number }> = [];

  for (const particle of particles) {
    const pattern = new RegExp(particle + particle, 'g');
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      duplicates.push({
        particle: particle + particle,
        count: matches.length,
      });
    }
  }

  return { duplicates };
}

/**
 * エディタのDOMから章情報を抽出する
 * レンダリング後の実IDが取れるため、Markdown解析より確実
 */
export function getChaptersFromDOM(): Chapter[] {
  const chapters: Chapter[] = [];
  
  // ブラウザ環境のみ
  if (typeof document === 'undefined') {
    return chapters;
  }
  
  const editorContent = document.querySelector('.milkdown');
  
  if (!editorContent) return chapters;
  
  // 見出し要素を列挙する
  const headings = editorContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName[1]);
    const anchorId = heading.id;
    const title = heading.textContent || '';
    
    chapters.push({
      level,
      title,
      lineNumber: index,
      charOffset: 0,
      anchorId: anchorId || undefined,
    });
  });
  
  return chapters;
}
