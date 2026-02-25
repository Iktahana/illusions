/**
 * Unified NLP Processor
 *
 * Single backend for both Electron (IPC) and Web (HTTP) modes.
 * Handles kuromoji initialization, noise cleaning, tokenization
 * with correct character positions, and word frequency analysis.
 */

import kuromoji from 'kuromoji';
import type { Token, WordEntry } from '../nlp-client/types';
import { NlpCache } from './nlp-cache';
import type { UserDictionaryEntry } from '../project/project-types';

// Noise characters to strip before tokenization
const NOISE_CHARS = new Set(['\n', '\r']);

// Excluded POS tags for frequency analysis
const EXCLUDED_POS = new Set(['助詞', '助動詞', '記号', 'フィラー', 'その他']);
const EXCLUDED_POS_DETAILS = new Set([
  '非自立', '接尾', '数', '代名詞', '句点', '読点', '空白', '括弧開', '括弧閉'
]);
// Note: ー (katakana prolonged sound mark) is intentionally NOT excluded
// because it appears in actual words like コンピューター
const EXCLUDED_CHARS_PATTERN = /^[\p{P}\p{S}\p{Z}\p{Cf}\s。、！？!?「」『』（）()【】［］\[\]・…―－〜～：；:;，,．.　""''〈〉《》〔〕｛｝＃＄＆＊＋＝＠＼＾｜]+$/u;

interface CleanResult {
  cleanedText: string;
  positionMap: number[];
}

class NlpProcessor {
  private tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
  private initPromise: Promise<void> | null = null;
  private isReady = false;
  private cache = new NlpCache();
  private userDictionary: UserDictionaryEntry[] = [];

  /**
   * Set user dictionary entries for token merging.
   * Entries are sorted by word length (longest first) for greedy matching.
   * Clears cache since tokenization results may change.
   */
  setUserDictionary(entries: UserDictionaryEntry[]): void {
    this.userDictionary = [...entries].sort(
      (a, b) => b.word.length - a.word.length,
    );
    this.cache.clear();
  }

  /**
   * Merge consecutive tokens that match user dictionary words.
   * Scans the token stream for sequences whose combined surface forms
   * match a user-defined word, then replaces them with a single token.
   */
  private mergeUserDictionaryTokens(tokens: Token[]): Token[] {
    if (this.userDictionary.length === 0) return tokens;

    const result: Token[] = [];
    let i = 0;

    while (i < tokens.length) {
      let matched = false;

      for (const dictEntry of this.userDictionary) {
        const word = dictEntry.word;
        // Try to match starting from token i
        let combined = '';
        let j = i;
        while (j < tokens.length && combined.length < word.length) {
          combined += tokens[j].surface;
          j++;
        }

        if (combined === word) {
          // Merge tokens[i..j-1] into a single token
          const mergedToken: Token = {
            surface: word,
            pos: dictEntry.partOfSpeech ?? tokens[i].pos,
            basic_form: word,
            reading: dictEntry.reading ?? tokens[i].reading,
            start: tokens[i].start,
            end: tokens[j - 1].end,
          };
          result.push(mergedToken);
          i = j;
          matched = true;
          break;
        }
      }

      if (!matched) {
        result.push(tokens[i]);
        i++;
      }
    }

    return result;
  }

  /**
   * Initialize kuromoji tokenizer
   *
   * @param dicPath - Dictionary directory path (env-specific)
   */
  async init(dicPath: string): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, tokenizer) => {
        if (err) {
          console.error('[NlpProcessor] Init error:', err);
          this.initPromise = null;
          reject(err);
        } else {
          this.tokenizer = tokenizer;
          this.isReady = true;
          resolve();
        }
      });
    });

    return this.initPromise;
  }

  /**
   * Clean text before tokenization: remove noise characters (\n, \r)
   * and build a position mapping to convert token positions back to original text.
   *
   * positionMap[cleanIndex] = originalIndex
   */
  cleanTextForTokenization(text: string): CleanResult {
    const positionMap: number[] = [];
    const cleanedChars: string[] = [];

    for (let i = 0; i < text.length; i++) {
      if (NOISE_CHARS.has(text[i])) {
        continue;
      }
      positionMap.push(i);
      cleanedChars.push(text[i]);
    }

    // End sentinel: maps cleanedText.length -> text.length
    positionMap.push(text.length);

    return {
      cleanedText: cleanedChars.join(''),
      positionMap,
    };
  }

  /**
   * Tokenize text with noise cleaning and correct character positions.
   *
   * 1. Strip noise characters (\n, \r) with position mapping
   * 2. Tokenize cleaned text with kuromoji
   * 3. Calculate character positions (not byte positions)
   * 4. Remap positions back to original text coordinates
   * 5. Cache result
   */
  async tokenize(text: string): Promise<Token[]> {
    // Check cache first (keyed on original text)
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

    if (!this.isReady) {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        throw new Error('NlpProcessor not initialized. Call init() first.');
      }
    }

    if (!this.tokenizer) {
      throw new Error('Tokenizer initialization failed');
    }

    // Step 1: Clean text
    const { cleanedText, positionMap } = this.cleanTextForTokenization(text);

    // Step 2: Tokenize cleaned text
    const rawTokens = this.tokenizer.tokenize(cleanedText);

    // Step 3: Build tokens with correct character positions
    let charPosition = 0;
    const tokens: Token[] = rawTokens.map(t => {
      const token: Token = {
        surface: t.surface_form,
        pos: t.pos,
        pos_detail_1: t.pos_detail_1,
        pos_detail_2: t.pos_detail_2,
        pos_detail_3: t.pos_detail_3,
        conjugation_type: t.conjugated_type,
        conjugation_form: t.conjugated_form,
        basic_form: t.basic_form,
        reading: t.reading,
        pronunciation: t.pronunciation,
        // Character positions in cleaned text
        start: charPosition,
        end: charPosition + t.surface_form.length,
      };
      charPosition += t.surface_form.length;
      return token;
    });

    // Step 4: Remap positions back to original text coordinates
    const remappedTokens = tokens.map(t => ({
      ...t,
      start: positionMap[t.start] ?? t.start,
      end: positionMap[t.end] ?? t.end,
    }));

    // Step 5: Apply user dictionary (merge matching token sequences)
    const mergedTokens = this.mergeUserDictionaryTokens(remappedTokens);

    // Step 6: Cache
    this.cache.set(text, mergedTokens);

    return mergedTokens;
  }

  /**
   * Batch tokenize multiple paragraphs
   */
  async tokenizeBatch(
    paragraphs: Array<{ pos: number; text: string }>
  ): Promise<Array<{ pos: number; tokens: Token[] }>> {
    const results: Array<{ pos: number; tokens: Token[] }> = [];

    for (const { pos, text } of paragraphs) {
      const tokens = await this.tokenize(text);
      results.push({ pos, tokens });
    }

    return results;
  }

  /**
   * Analyze word frequency in text
   *
   * Tokenizes text, filters by POS, and returns sorted word entries.
   */
  async analyzeWordFrequency(text: string): Promise<{
    words: WordEntry[];
    totalWords: number;
    uniqueWords: number;
  }> {
    if (!this.isReady) {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        throw new Error('NlpProcessor not initialized. Call init() first.');
      }
    }

    if (!this.tokenizer) {
      throw new Error('Tokenizer initialization failed');
    }

    // For frequency analysis, positions don't matter — tokenize raw text
    const rawTokens = this.tokenizer.tokenize(text);

    // Build Token[] for user dictionary merging
    let charPos = 0;
    const tokensForMerge: Token[] = rawTokens.map(t => {
      const token: Token = {
        surface: t.surface_form,
        pos: t.pos,
        pos_detail_1: t.pos_detail_1,
        pos_detail_2: t.pos_detail_2,
        pos_detail_3: t.pos_detail_3,
        basic_form: t.basic_form,
        reading: t.reading,
        start: charPos,
        end: charPos + t.surface_form.length,
      };
      charPos += t.surface_form.length;
      return token;
    });

    // Apply user dictionary merging
    const mergedTokens = this.mergeUserDictionaryTokens(tokensForMerge);

    const wordMap = new Map<string, WordEntry>();

    for (const t of mergedTokens) {
      if (EXCLUDED_POS.has(t.pos)) continue;
      if (t.pos_detail_1 && EXCLUDED_POS_DETAILS.has(t.pos_detail_1)) continue;
      if (!t.surface.trim()) continue;
      if (EXCLUDED_CHARS_PATTERN.test(t.surface)) continue;

      const key = t.basic_form && t.basic_form !== '*'
        ? t.basic_form
        : t.surface;

      const existing = wordMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        wordMap.set(key, {
          word: key,
          reading: t.reading !== '*' ? t.reading : undefined,
          pos: t.pos,
          count: 1,
        });
      }
    }

    const words = Array.from(wordMap.values()).sort((a, b) => b.count - a.count);
    const totalWords = words.reduce((sum, w) => sum + w.count, 0);

    return {
      words,
      totalWords,
      uniqueWords: words.length,
    };
  }

  /**
   * Check if the processor has been initialized
   */
  isInitialized(): boolean {
    return this.isReady;
  }

  /**
   * Destroy tokenizer and reset state
   */
  destroy(): void {
    this.tokenizer = null;
    this.isReady = false;
    this.initPromise = null;
    this.cache.clear();
  }
}

// Singleton instance (one per process)
export const nlpProcessor = new NlpProcessor();
