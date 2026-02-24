/** A character extracted by the LLM */
export interface ExtractedCharacter {
  name: string;
  aliases: string[];
  description: string;
}

/** Raw LLM response shape from both extractor and merger prompts */
export interface ExtractorResponse {
  characters: ExtractedCharacter[];
}

/** Progress callback information */
export interface ExtractionProgress {
  phase: "extracting" | "merging";
  current: number;
  total: number;
}

/** Options for CharacterExtractor.extract() */
export interface CharacterExtractorOptions {
  /** Number of paragraphs per LLM batch call. Default: 3 */
  batchSize: number;
  /** Number of parallel sequences per inference wave. Default: 4, max: 8 */
  concurrency: number;
  /** Max intermediate result sets to feed into one merger call. Default: 5 */
  mergerChunkSize: number;
  /** Max tokens for LLM generation per call. Default: 2048 */
  maxTokens: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Progress callback */
  onProgress?: (progress: ExtractionProgress) => void;
}
