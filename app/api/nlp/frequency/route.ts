/**
 * API Route: /api/nlp/frequency
 * 
 * Analyze word frequency in text.
 * Returns sorted list of words with occurrence counts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tokenizerService } from '../shared/tokenizer-service';
import type { FrequencyAnalysisRequest, FrequencyAnalysisResponse, WordEntry } from '@/lib/nlp-client/types';

// Excluded POS tags
const EXCLUDED_POS = new Set(['助詞', '助動詞', '記号', 'フィラー', 'その他']);

// Excluded POS details
const EXCLUDED_POS_DETAILS = new Set([
  '非自立', '接尾', '数', '代名詞', '句点', '読点', '空白', '括弧開', '括弧閉'
]);

// Excluded character pattern (symbols and punctuation)
const EXCLUDED_CHARS_PATTERN = /^[。、！？!?「」『』（）()【】［］\[\]・…―－ー〜～：；:;，,．.　\s]+$/;

export async function POST(request: NextRequest) {
  try {
    const body: FrequencyAnalysisRequest = await request.json();
    const { text } = body;

    // Validate input
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid text parameter' },
        { status: 400 }
      );
    }

    // Tokenize text
    const tokens = await tokenizerService.tokenize(text);
    
    // Build frequency map
    const wordMap = new Map<string, WordEntry>();

    for (const token of tokens) {
      // Filter excluded POS
      if (EXCLUDED_POS.has(token.pos)) continue;
      if (token.pos_detail_1 && EXCLUDED_POS_DETAILS.has(token.pos_detail_1)) continue;
      if (!token.surface.trim()) continue;
      if (EXCLUDED_CHARS_PATTERN.test(token.surface)) continue;

      // Use basic form as key (or surface if not available)
      const key = token.basic_form && token.basic_form !== '*' 
        ? token.basic_form 
        : token.surface;

      const existing = wordMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        wordMap.set(key, {
          word: key,
          reading: token.reading !== '*' ? token.reading : undefined,
          pos: token.pos,
          count: 1,
        });
      }
    }

    // Sort by count descending
    const words = Array.from(wordMap.values()).sort((a, b) => b.count - a.count);
    const totalWords = words.reduce((sum, w) => sum + w.count, 0);

    const response: FrequencyAnalysisResponse = {
      words,
      totalWords,
      uniqueWords: words.length,
    };

    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[API /nlp/frequency] Error:', error);
    return NextResponse.json(
      { 
        error: 'Frequency analysis failed', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
