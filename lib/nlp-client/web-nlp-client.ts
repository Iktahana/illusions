/**
 * Web NLP Client
 * 
 * Communicates with Next.js API routes for NLP operations.
 * Makes HTTP requests to /api/nlp/* endpoints.
 */

import type { 
  INlpClient, 
  Token, 
  TokenizeProgress, 
  WordEntry,
  ParagraphTokenizeResponse,
  BatchTokenizeResponse,
  FrequencyAnalysisResponse
} from './types';

export class WebNlpClient implements INlpClient {
  private readonly baseUrl = '/api/nlp';

  /**
   * Tokenize a single paragraph using API
   * 
   * @param text - Paragraph text
   * @returns Promise of token array
   * @throws Error if API request fails
   */
  async tokenizeParagraph(text: string): Promise<Token[]> {
    const response = await fetch(`${this.baseUrl}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Tokenization failed: ${response.statusText} - ${error}`);
    }

    const data: ParagraphTokenizeResponse = await response.json();
    return data.tokens;
  }

  /**
   * Tokenize multiple paragraphs in batch using API
   * 
   * Note: Web mode does not support real-time progress updates
   * due to HTTP limitations. Progress callback is called once at completion.
   * 
   * @param paragraphs - Array of {pos, text} objects
   * @param onProgress - Optional progress callback (called once at end)
   * @returns Promise of array with {pos, tokens} results
   * @throws Error if API request fails
   */
  async tokenizeDocument(
    paragraphs: Array<{ pos: number; text: string }>,
    onProgress?: (progress: TokenizeProgress) => void
  ): Promise<Array<{ pos: number; tokens: Token[] }>> {
    const response = await fetch(`${this.baseUrl}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphs }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Batch tokenization failed: ${response.statusText} - ${error}`);
    }

    const data: BatchTokenizeResponse = await response.json();
    
    // Simulate progress (immediate completion in web mode)
    if (onProgress) {
      onProgress({ 
        completed: paragraphs.length, 
        total: paragraphs.length, 
        percentage: 100 
      });
    }
    
    return data.results;
  }

  /**
   * Analyze word frequency using API
   * 
   * @param text - Full document text
   * @returns Promise of sorted word entries
   * @throws Error if API request fails
   */
  async analyzeWordFrequency(text: string): Promise<WordEntry[]> {
    const response = await fetch(`${this.baseUrl}/frequency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Frequency analysis failed: ${response.statusText} - ${error}`);
    }

    const data: FrequencyAnalysisResponse = await response.json();
    return data.words;
  }
}
