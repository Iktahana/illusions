import type { ILlmClient } from "@/lib/llm-client/types";

import { EXTRACTOR_PROMPT, MERGER_PROMPT } from "@/prompts/character-extraction";

import type {
  ExtractedCharacter,
  ExtractorResponse,
  CharacterExtractorOptions,
} from "./types";

const DEFAULT_OPTIONS: CharacterExtractorOptions = {
  batchSize: 3,
  concurrency: 4,
  mergerChunkSize: 5,
  maxTokens: 2048,
};

/**
 * LLM-powered character extractor.
 * Processes document paragraphs in batches, extracts characters,
 * and deduplicates via recursive merging.
 */
export class CharacterExtractor {
  private readonly client: ILlmClient;

  constructor(client: ILlmClient) {
    this.client = client;
  }

  /**
   * Extract characters from document paragraphs.
   *
   * Pipeline:
   * 1. Batch paragraphs -> build prompts
   * 2. Run extraction in parallel waves (inferBatch or sequential fallback)
   * 3. Parse JSON responses
   * 4. Recursive merge/deduplication
   */
  async extract(
    paragraphs: string[],
    options: Partial<CharacterExtractorOptions> = {},
  ): Promise<ExtractedCharacter[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const { batchSize, concurrency, signal, onProgress } = opts;

    if (paragraphs.length === 0) return [];

    // Step 1: Group paragraphs into prompt batches
    const promptBatches = this.buildPromptBatches(paragraphs, batchSize);
    const totalBatches = promptBatches.length;

    // Step 2: Process in waves of `concurrency`
    const allExtracted: ExtractedCharacter[][] = [];
    let processed = 0;

    for (let i = 0; i < promptBatches.length; i += concurrency) {
      if (signal?.aborted) break;

      const wave = promptBatches.slice(i, i + concurrency);

      let results: Array<{ text: string; tokenCount: number }>;

      // Use inferBatch for multi-prompt waves, fall back to sequential
      if (wave.length > 1) {
        results = await this.client.inferBatch(wave, {
          signal,
          maxTokens: opts.maxTokens,
        });
      } else {
        results = [];
        for (const prompt of wave) {
          if (signal?.aborted) break;
          const r = await this.client.infer(prompt, {
            signal,
            maxTokens: opts.maxTokens,
          });
          results.push(r);
        }
      }

      // Parse each result
      for (const result of results) {
        const parsed = this.parseJsonResponse(result.text);
        if (parsed.characters.length > 0) {
          allExtracted.push(parsed.characters);
        }
      }

      processed += wave.length;
      onProgress?.({
        phase: "extracting",
        current: Math.min(processed, totalBatches),
        total: totalBatches,
      });
    }

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (allExtracted.length === 0) {
      return [];
    }

    // Step 3: Merge/deduplicate
    const flatCharacters = allExtracted.flat();
    if (flatCharacters.length === 0) return [];

    return this.mergeCharacters(flatCharacters, opts);
  }

  /** Build extraction prompts by grouping paragraphs */
  private buildPromptBatches(paragraphs: string[], batchSize: number): string[] {
    const batches: string[] = [];
    for (let i = 0; i < paragraphs.length; i += batchSize) {
      const chunk = paragraphs.slice(i, i + batchSize);
      const text = chunk.join("\n\n");
      const prompt = EXTRACTOR_PROMPT.replace("{{TEXT_SEGMENT}}", text);
      batches.push(prompt);
    }
    return batches;
  }

  /** Recursive merge/deduplication of extracted characters */
  private async mergeCharacters(
    characters: ExtractedCharacter[],
    opts: CharacterExtractorOptions,
  ): Promise<ExtractedCharacter[]> {
    const { mergerChunkSize, signal, onProgress, maxTokens } = opts;

    // If small enough, do a single merge
    if (characters.length <= mergerChunkSize) {
      const merged = await this.runMerger(characters, { signal, maxTokens });
      onProgress?.({ phase: "merging", current: 1, total: 1 });
      return merged;
    }

    // Chunk and merge recursively
    const chunks: ExtractedCharacter[][] = [];
    for (let i = 0; i < characters.length; i += mergerChunkSize) {
      chunks.push(characters.slice(i, i + mergerChunkSize));
    }

    const mergedResults: ExtractedCharacter[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const merged = await this.runMerger(chunks[i], { signal, maxTokens });
      mergedResults.push(...merged);
      onProgress?.({ phase: "merging", current: i + 1, total: chunks.length });
    }

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // If still too many, recurse
    if (mergedResults.length > mergerChunkSize) {
      return this.mergeCharacters(mergedResults, opts);
    }

    // Final merge pass
    if (mergedResults.length > 1) {
      return this.runMerger(mergedResults, { signal, maxTokens });
    }

    return mergedResults;
  }

  /** Run a single merger LLM call */
  private async runMerger(
    characters: ExtractedCharacter[],
    options: { signal?: AbortSignal; maxTokens: number },
  ): Promise<ExtractedCharacter[]> {
    const jsonInput = JSON.stringify(
      characters.map((c) => ({
        name: c.name,
        aliases: c.aliases,
        description: c.description,
      })),
      null,
      2,
    );

    const prompt = MERGER_PROMPT.replace("{{JSON_LIST_FROM_STAGE_1}}", jsonInput);
    const result = await this.client.infer(prompt, {
      signal: options.signal,
      maxTokens: options.maxTokens,
    });

    const parsed = this.parseJsonResponse(result.text);
    return parsed.characters;
  }

  /**
   * Parse LLM JSON response with defensive handling.
   * Handles: markdown fences, extra text, malformed JSON.
   */
  private parseJsonResponse(text: string): ExtractorResponse {
    try {
      // Strip markdown code fences
      let cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();

      // Find the JSON object
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");

      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return { characters: [] };
      }

      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      const parsed: unknown = JSON.parse(cleaned);

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "characters" in parsed &&
        Array.isArray((parsed as ExtractorResponse).characters)
      ) {
        // Validate each character entry
        const characters = (parsed as ExtractorResponse).characters
          .filter(
            (c): c is ExtractedCharacter =>
              typeof c === "object" &&
              c !== null &&
              typeof c.name === "string" &&
              c.name.length > 0,
          )
          .map((c) => ({
            name: c.name,
            aliases: Array.isArray(c.aliases)
              ? c.aliases.filter((a): a is string => typeof a === "string")
              : [],
            description: typeof c.description === "string" ? c.description : "",
          }));
        return { characters };
      }

      return { characters: [] };
    } catch {
      console.error("[CharacterExtractor] Failed to parse LLM response:", text.slice(0, 200));
      return { characters: [] };
    }
  }
}
