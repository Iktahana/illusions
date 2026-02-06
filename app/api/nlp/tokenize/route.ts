/**
 * API Route: /api/nlp/tokenize
 * 
 * Tokenize a single paragraph of text.
 * Returns token array with morphological analysis results.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tokenizerService } from '../shared/tokenizer-service';
import { serverCache } from '../shared/server-cache';
import type { ParagraphTokenizeRequest, ParagraphTokenizeResponse } from '@/lib/nlp-client/types';

export async function POST(request: NextRequest) {
  try {
    const body: ParagraphTokenizeRequest = await request.json();
    const { text } = body;

    // Validate input
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid text parameter' },
        { status: 400 }
      );
    }

    // Check cache first
    let tokens = serverCache.get(text);
    
    if (!tokens) {
      // Tokenize and cache
      tokens = await tokenizerService.tokenize(text);
      serverCache.set(text, tokens);
    }

    const response: ParagraphTokenizeResponse = { tokens };
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[API /nlp/tokenize] Error:', error);
    return NextResponse.json(
      { 
        error: 'Tokenization failed', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
