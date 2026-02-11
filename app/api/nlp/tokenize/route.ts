/**
 * API Route: /api/nlp/tokenize (HTTP Adapter)
 *
 * Tokenize a single paragraph of text.
 * Delegates to shared NlpProcessor backend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nlpProcessor } from '@/lib/nlp-backend/nlp-processor';
import type { ParagraphTokenizeRequest, ParagraphTokenizeResponse } from '@/lib/nlp-client/types';

const WEB_DIC_PATH = process.cwd() + '/public/dict';

export async function POST(request: NextRequest) {
  try {
    const body: ParagraphTokenizeRequest = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid text parameter' },
        { status: 400 }
      );
    }

    if (!nlpProcessor.isInitialized()) {
      await nlpProcessor.init(WEB_DIC_PATH);
    }

    const tokens = await nlpProcessor.tokenize(text);
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
