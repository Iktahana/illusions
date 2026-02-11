/**
 * API Route: /api/nlp/frequency (HTTP Adapter)
 *
 * Analyze word frequency in text.
 * Delegates to shared NlpProcessor backend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nlpProcessor } from '@/lib/nlp-backend/nlp-processor';
import type { FrequencyAnalysisRequest, FrequencyAnalysisResponse } from '@/lib/nlp-client/types';

const WEB_DIC_PATH = process.cwd() + '/public/dict';

export async function POST(request: NextRequest) {
  try {
    const body: FrequencyAnalysisRequest = await request.json();
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

    const result = await nlpProcessor.analyzeWordFrequency(text);
    const response: FrequencyAnalysisResponse = result;
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
