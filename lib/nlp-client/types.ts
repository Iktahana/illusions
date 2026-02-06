/**
 * Shared NLP Types and Interfaces
 * 
 * Used by:
 * - Frontend NLP clients (Electron & Web)
 * - Backend services (Electron main process & Next.js API)
 * - Components (decoration-plugin, WordFrequency)
 */

/**
 * Token structure from kuromoji morphological analysis
 */
export interface Token {
  /** Surface form (表層形) */
  surface: string;
  
  /** Part of speech (品詞) */
  pos: string;
  
  /** POS detail 1 (品詞細分類1) */
  pos_detail_1?: string;
  
  /** POS detail 2 (品詞細分類2) */
  pos_detail_2?: string;
  
  /** POS detail 3 (品詞細分類3) */
  pos_detail_3?: string;
  
  /** Conjugation type (活用型) */
  conjugation_type?: string;
  
  /** Conjugation form (活用形) */
  conjugation_form?: string;
  
  /** Basic form (基本形) */
  basic_form?: string;
  
  /** Reading in katakana (読み) */
  reading?: string;
  
  /** Pronunciation (発音) */
  pronunciation?: string;
  
  /** Start position in text (0-indexed) */
  start: number;
  
  /** End position in text (exclusive) */
  end: number;
}

/**
 * Request for single paragraph tokenization
 */
export interface ParagraphTokenizeRequest {
  text: string;
}

/**
 * Response for single paragraph tokenization
 */
export interface ParagraphTokenizeResponse {
  tokens: Token[];
}

/**
 * Request for batch document tokenization
 */
export interface BatchTokenizeRequest {
  paragraphs: Array<{
    pos: number;  // Position in ProseMirror document
    text: string;
  }>;
}

/**
 * Response for batch document tokenization
 */
export interface BatchTokenizeResponse {
  results: Array<{
    pos: number;
    tokens: Token[];
  }>;
}

/**
 * Request for word frequency analysis
 */
export interface FrequencyAnalysisRequest {
  text: string;
}

/**
 * Word entry with frequency count
 */
export interface WordEntry {
  /** Word (基本形 if available, otherwise 表層形) */
  word: string;
  
  /** Reading in katakana */
  reading?: string;
  
  /** Part of speech */
  pos: string;
  
  /** Occurrence count */
  count: number;
}

/**
 * Response for word frequency analysis
 */
export interface FrequencyAnalysisResponse {
  /** Sorted word entries (by count descending) */
  words: WordEntry[];
  
  /** Total word count (excluding filtered POS) */
  totalWords: number;
  
  /** Unique word count */
  uniqueWords: number;
}

/**
 * Progress information for batch operations
 */
export interface TokenizeProgress {
  /** Number of completed paragraphs */
  completed: number;
  
  /** Total number of paragraphs */
  total: number;
  
  /** Percentage (0-100) */
  percentage: number;
}

/**
 * Abstract NLP Client Interface
 * 
 * Implementations:
 * - ElectronNlpClient: Uses IPC to communicate with Electron main process
 * - WebNlpClient: Uses fetch to call Next.js API routes
 */
export interface INlpClient {
  /**
   * Tokenize a single paragraph
   * 
   * @param text - Paragraph text
   * @returns Promise of token array
   */
  tokenizeParagraph(text: string): Promise<Token[]>;
  
  /**
   * Tokenize multiple paragraphs in batch
   * 
   * @param paragraphs - Array of {pos, text} objects
   * @param onProgress - Optional progress callback
   * @returns Promise of array with {pos, tokens} results
   */
  tokenizeDocument(
    paragraphs: Array<{ pos: number; text: string }>,
    onProgress?: (progress: TokenizeProgress) => void
  ): Promise<Array<{ pos: number; tokens: Token[] }>>;
  
  /**
   * Analyze word frequency in text
   * 
   * @param text - Full document text
   * @returns Promise of sorted word entries
   */
  analyzeWordFrequency(text: string): Promise<WordEntry[]>;
}
