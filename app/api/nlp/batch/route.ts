/**
 * API Route: /api/nlp/batch (HTTP Adapter)
 *
 * Tokenize multiple paragraphs in batch.
 * Delegates to shared NlpProcessor backend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nlpProcessor } from '@/lib/nlp-backend/nlp-processor';
import type { BatchTokenizeRequest, BatchTokenizeResponse } from '@/lib/nlp-client/types';

const WEB_DIC_PATH = process.cwd() + '/public/dict';

export async function POST(request: NextRequest) {
  try {
    const body: BatchTokenizeRequest = await request.json();
    const { paragraphs } = body;

    if (!Array.isArray(paragraphs)) {
      return NextResponse.json(
        { error: 'Invalid paragraphs parameter' },
        { status: 400 }
      );
    }

    if (!nlpProcessor.isInitialized()) {
      await nlpProcessor.init(WEB_DIC_PATH);
    }

    const results = await nlpProcessor.tokenizeBatch(paragraphs);
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
