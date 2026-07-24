/**
 * Electron NLP Client
 *
 * Communicates with Electron main process via IPC for NLP operations.
 * Requires window.electronAPI.nlp to be exposed by preload script.
 */

import type { INlpClient, Token, TokenizeProgress, WordEntry } from "@/lib/nlp-client/types";
import { getElectronAPI } from "@/platform/electron-renderer/electron-api";

type ElectronNlpAPI = NonNullable<Window["electronAPI"]>["nlp"];

function requireElectronNlpAPI(): NonNullable<ElectronNlpAPI> {
  const nlp = getElectronAPI()?.nlp;

  if (!nlp) {
    throw new Error(
      "Electron NLP API is unavailable: window.electronAPI.nlp was not exposed. " +
        "Ensure the Electron preload script exposes the NLP IPC bridge.",
    );
  }

  return nlp;
}

export class ElectronNlpClient implements INlpClient {
  /**
   * Tokenize a single paragraph using Electron main process
   *
   * @param text - Paragraph text
   * @returns Promise of token array
   * @throws Error if Electron NLP API is not available
   */
  async tokenizeParagraph(text: string): Promise<Token[]> {
    return requireElectronNlpAPI().tokenizeParagraph(text);
  }

  /**
   * Tokenize multiple paragraphs in batch using Electron main process
   *
   * @param paragraphs - Array of {pos, text} objects
   * @param onProgress - Optional progress callback
   * @returns Promise of array with {pos, tokens} results
   * @throws Error if Electron NLP API is not available
   */
  async tokenizeDocument(
    paragraphs: Array<{ pos: number; text: string }>,
    onProgress?: (progress: TokenizeProgress) => void,
  ): Promise<Array<{ pos: number; tokens: Token[] }>> {
    return requireElectronNlpAPI().tokenizeDocument(paragraphs, onProgress);
  }

  /**
   * Analyze word frequency using Electron main process
   *
   * @param text - Full document text
   * @returns Promise of sorted word entries
   * @throws Error if Electron NLP API is not available
   */
  async analyzeWordFrequency(text: string): Promise<WordEntry[]> {
    return requireElectronNlpAPI().analyzeWordFrequency(text);
  }
}
