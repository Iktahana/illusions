/**
 * AI Client types and interfaces.
 *
 * Phase 1 uses the OpenAI SDK directly. Switching to a self-hosted
 * LiteLLM Gateway later requires only changing baseUrl and apiKey —
 * all types and the IAiClient interface remain the same.
 */

import type { LintIssue } from "@/lib/linting/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Transport-level configuration for the AI client.
 *
 * Does NOT include feature flags (e.g. llmEnabled). Feature flags
 * gate at their own call sites, not at the transport layer.
 */
export interface AiClientConfig {
  /** API key (OpenAI key or LiteLLM virtual key) */
  apiKey: string;
  /** Base URL — defaults to `https://api.openai.com/v1` */
  baseUrl?: string;
  /** Model ID for online AI — separate from llmModelId (local model) */
  modelId: string;
}

// ---------------------------------------------------------------------------
// Domain result types
// ---------------------------------------------------------------------------

/** Result of LLM-based lint issue validation (L3) */
export interface LintValidationResult {
  /** The rule ID of the issue being validated */
  issueRuleId: string;
  /** Whether the LLM considers this a genuine issue (true) or false positive (false) */
  isGenuine: boolean;
  /** LLM's reasoning for the decision */
  reasoning: string;
}

/** AI-generated rewrite suggestion */
export interface RewriteSuggestion {
  /** The original text that was submitted */
  original: string;
  /** The suggested rewrite */
  suggestion: string;
  /** Explanation of the changes */
  explanation: string;
}

/** A character extracted from novel text by AI */
export interface ExtractedCharacter {
  /** Character name */
  name: string;
  /** Alternative names or nicknames */
  aliases: string[];
  /** Brief description of the character */
  description: string;
}

/** Chat message for AI assistant conversations */
export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

/**
 * AI client interface.
 *
 * All methods accept an optional AbortSignal for cancellation.
 * Domain methods compose prompts internally — callers don't need
 * to know the prompt structure.
 */
export interface IAiClient {
  /** Whether the client has a valid API key and is ready to make requests */
  isConfigured(): boolean;

  /**
   * Validate whether lint issues are genuine or false positives.
   * Used for L3 lint rule validation.
   */
  validateLintIssues(
    text: string,
    issues: LintIssue[],
    signal?: AbortSignal,
  ): Promise<LintValidationResult[]>;

  /**
   * Suggest a rewrite/polish for the given text.
   * @param instruction Optional instruction to guide the rewrite style
   */
  suggestRewrite(
    text: string,
    instruction?: string,
    signal?: AbortSignal,
  ): Promise<RewriteSuggestion>;

  /**
   * Extract character information from novel text.
   * @param existingNames Known character names to avoid duplicates
   */
  extractCharacters(
    text: string,
    existingNames?: string[],
    signal?: AbortSignal,
  ): Promise<ExtractedCharacter[]>;

  /**
   * Send a streaming chat completion.
   * Returns an async iterable of content deltas.
   */
  streamChat(messages: AiChatMessage[], signal?: AbortSignal): AsyncIterable<string>;
}
