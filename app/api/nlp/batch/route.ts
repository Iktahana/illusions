/**
 * API Route: /api/nlp/batch
 * 
 * Tokenize multiple paragraphs in batch.
 * Processes sequentially with caching for efficiency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tokenizerService } from '../shared/tokenizer-service';
import { serverCache } from '../shared/server-cache';
import type { BatchTokenizeRequest, BatchTokenizeResponse } from '@/lib/nlp-client/types';

export async function POST(request: NextRequest) {
  try {
    const body: BatchTokenizeRequest = await request.json();
    const { paragraphs } = body;

    // Validate input
    if (!Array.isArray(paragraphs)) {
      return NextResponse.json(
        { error: 'Invalid paragraphs parameter' },
        { status: 400 }
      );
    }

    const results = [];

    // Process each paragraph sequentially
    for (const paragraph of paragraphs) {
      const { pos, text } = paragraph;
      
      // Check cache
      let tokens = serverCache.get(text);
      
      if (!tokens) {
        // Tokenize and cache
        tokens = await tokenizerService.tokenize(text);
        serverCache.set(text, tokens);
      }
      
      results.push({ pos, tokens });
    }

    const response: BatchTokenizeResponse = { results };
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[API /nlp/batch] Error:', error);
    return NextResponse.json(
      { 
        error: 'Batch tokenization failed', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
