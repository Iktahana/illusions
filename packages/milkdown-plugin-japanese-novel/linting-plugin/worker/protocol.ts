/**
 * Worker protocol — types shared between the main thread and the lint
 * Web Worker.
 *
 * The worker hosts only non-morphological rules (the JSON L1 set);
 * morphological rules stay on the main thread (see plan
 * docs/superpowers/plans/2026-05-05-lint-worker-parallelization.md,
 * Architecture decision 9).
 */

import type { LintIssue, LintRuleConfig } from "@/lib/linting/types";
import type { Token } from "@/lib/nlp-client/types";

// -------------------------------------------------------------------------
// Plugin-facing surface
// -------------------------------------------------------------------------

/**
 * Subset of `RuleRunner` used by the linting ProseMirror plugin.
 * The proxy implements this with a worker behind it; tests can swap in
 * a fake. Sync metadata methods stay sync; rule execution becomes async.
 */
export interface RuleRunnerLike {
  setConfig(ruleId: string, config: LintRuleConfig): void;
  setActiveGuidelines(guidelines: string[] | null): void;
  setGuidelineMap(map: Map<string, string | undefined>): void;
  hasMorphologicalRules(): boolean;
  hasDocumentRules(): boolean;
  /**
   * True iff at least one enabled document-level rule needs morphological
   * tokens. Callers use this to decide whether to tokenize cached
   * paragraphs in addition to the uncached set.
   */
  hasMorphologicalDocumentRules(): boolean;
  /** Execute one batched lint pass. */
  runBatch(req: RunBatchRequest): Promise<RunBatchResponse>;
  /**
   * Reject every in-flight `runBatch` promise with `WorkerStaleError`.
   * The worker keeps running; subsequent calls succeed normally.
   */
  cancelInFlight(): void;
  /** Terminate the worker; all pending requests reject with `WorkerDisposedError`. */
  dispose(): void;
}

// -------------------------------------------------------------------------
// Run-batch payload
// -------------------------------------------------------------------------

export interface BatchParagraph {
  /** Paragraph text (input to L1 regex rules). */
  text: string;
  /** Stable index used to key document-level results. */
  index: number;
  /**
   * Pre-computed kuromoji tokens. Only required when the proxy's main-side
   * morphological rules need them; ignored by the worker (which has no
   * morphological rules registered).
   */
  tokens?: ReadonlyArray<Token>;
}

/**
 * What the runner should compute for this batch.
 *
 * - `"per-paragraph"`: run only the per-paragraph rules. Caller typically
 *   supplies the uncached subset.
 * - `"document"`: run only the document-level rules. Caller typically
 *   supplies all paragraphs in the document.
 * - `"both"`: run both passes against the same input. Useful on initial
 *   load when no cache exists yet.
 */
export type BatchMode = "per-paragraph" | "document" | "both";

export interface RunBatchRequest {
  paragraphs: ReadonlyArray<BatchParagraph>;
  mode: BatchMode;
  /** Monotonic version supplied by the caller; the proxy filters stale responses. */
  version: number;
  /**
   * If `false`, skip the worker round-trip. Useful when the caller
   * wants only main-thread morph results.
   * Defaults to `true`.
   */
  runWorker?: boolean;
}

export interface RunBatchResponse {
  /** Issues per paragraph, keyed by `BatchParagraph.index`. */
  perParagraph: Map<number, LintIssue[]>;
  /** Document-level issues per paragraph, keyed by `BatchParagraph.index`. */
  document: Map<number, LintIssue[]>;
}

// -------------------------------------------------------------------------
// Wire format
// -------------------------------------------------------------------------

/**
 * Serializable form of `runDocument*` results — `Map` does not
 * structured-clone reliably across all environments, so we send arrays.
 */
export type SerializedIssueMap = Array<[number, LintIssue[]]>;

/** A single warning emitted by the ruleset loader or registry. */
export interface RulesetLoadWarning {
  code: string;
  messageJa: string;
  detail?: string;
}

/** Worker → main events. */
export type WorkerEvent =
  | { type: "READY" }
  | {
      type: "RESPONSE";
      correlationId: number;
      version: number;
      perParagraph: SerializedIssueMap;
      document: SerializedIssueMap;
    }
  | {
      type: "ERROR";
      correlationId?: number;
      error: { name: string; message: string };
    }
  | {
      type: "RULESET_LOADED";
      correlationId: number;
      id: string;
      ok: boolean;
      ruleIds: string[];
      warnings: RulesetLoadWarning[];
      /**
       * Whether the worker's rebuilt runner now hosts at least one
       * registered morphological (L2) rule. The proxy uses this to decide
       * whether to (a) report `hasMorphologicalRules()` as true so the
       * decoration plugin tokenizes paragraphs, and (b) forward those
       * tokens to the worker in subsequent RUN_BATCH messages.
       * Computed from registered rules regardless of enabled state, so
       * tokens start flowing before the main thread sends SET_CONFIG.
       */
      hasMorphologicalRules: boolean;
    };

/** Main → worker requests. */
export type WorkerRequest =
  | {
      type: "SET_CONFIG";
      correlationId: number;
      ruleId: string;
      config: LintRuleConfig;
    }
  | {
      type: "SET_ACTIVE_GUIDELINES";
      correlationId: number;
      guidelines: string[] | null;
    }
  | {
      type: "SET_GUIDELINE_MAP";
      correlationId: number;
      entries: Array<[string, string | undefined]>;
    }
  | {
      type: "RUN_BATCH";
      correlationId: number;
      version: number;
      /**
       * `tokens` are present only when the worker hosts morphological (L2)
       * rules (external rulesets). The proxy omits them otherwise to keep
       * the structured-clone payload small for the common L1-only case.
       */
      paragraphs: ReadonlyArray<{ text: string; index: number; tokens?: ReadonlyArray<Token> }>;
      mode: BatchMode;
    }
  | {
      /** Load (or reload) an external ruleset by injecting its ESM source. */
      type: "LOAD_RULESET";
      correlationId: number;
      id: string;
      /** Full ESM module source string (already sha256-verified by the main process). */
      code: string;
    }
  | {
      /** Unload a previously-loaded external ruleset and rebuild the runner. */
      type: "UNLOAD_RULESET";
      correlationId: number;
      id: string;
    };

// -------------------------------------------------------------------------
// Sentinel errors (silent-cancel)
// -------------------------------------------------------------------------

/**
 * Thrown when a `runBatch` promise is rejected because a newer request
 * has superseded it (or `cancelInFlight()` was called). Callers in the
 * decoration plugin swallow this — no cache write, no decoration dispatch.
 */
export class WorkerStaleError extends Error {
  constructor(message = "Lint batch superseded by a newer request") {
    super(message);
    this.name = "WorkerStaleError";
  }
}

/**
 * Thrown when a `runBatch` promise is rejected because the worker has
 * been terminated (proxy disposed). Treated identically to
 * `WorkerStaleError` by callers — silent cancel.
 */
export class WorkerDisposedError extends Error {
  constructor(message = "Lint worker has been disposed") {
    super(message);
    this.name = "WorkerDisposedError";
  }
}

/** True for any silent-cancel sentinel; callers can drop the result. */
export function isSilentCancelError(err: unknown): boolean {
  return err instanceof WorkerStaleError || err instanceof WorkerDisposedError;
}
