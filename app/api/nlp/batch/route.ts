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

/** Maximum number of paragraphs per batch request (matches Electron IPC limit) */
const MAX_PARAGRAPHS = 10_000;

/** Maximum text length per paragraph (matches Electron IPC single-paragraph limit) */
const MAX_PARAGRAPH_TEXT_LENGTH = 1_000_000;

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

    if (paragraphs.length > MAX_PARAGRAPHS) {
      return NextResponse.json(
        { error: `Batch exceeds maximum of ${MAX_PARAGRAPHS} paragraphs` },
        { status: 413 }
      );
    }

    // Validate each paragraph structure and text length
    for (const p of paragraphs) {
      if (typeof p?.text !== 'string' || typeof p?.pos !== 'number') {
        return NextResponse.json(
          { error: 'Invalid paragraph structure: each entry must have { text: string, pos: number }' },
          { status: 400 }
        );
      }
      if (p.text.length > MAX_PARAGRAPH_TEXT_LENGTH) {
        return NextResponse.json(
          { error: `Paragraph text exceeds maximum length of ${MAX_PARAGRAPH_TEXT_LENGTH} characters` },
          { status: 413 }
        );
      }
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
