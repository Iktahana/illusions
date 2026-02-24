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

/** Maximum text length for single paragraph tokenization (matches Electron IPC limit) */
const MAX_TEXT_LENGTH = 1_000_000;

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

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` },
        { status: 413 }
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
