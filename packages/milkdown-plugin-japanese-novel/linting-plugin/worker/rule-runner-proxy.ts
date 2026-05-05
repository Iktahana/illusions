/**
 * Main-thread proxy for the lint Web Worker.
 *
 * Hosts a small synchronous `RuleRunner` for morphological (L2) rules
 * that cannot run in the worker (their `genjiVocab` dependency uses
 * Electron IPC). The worker handles regex (L1) rules. `runBatch`
 * presents a unified async API; callers don't see the split.
 */

import { RuleRunner } from "@/lib/linting/rule-runner";
import { createJsonDrivenRules, getAllRules } from "@/lib/linting/rule-registry";
import { RULE_GUIDELINE_MAP } from "@/lib/linting/lint-presets";
import {
  isDocumentLintRule,
  isMorphologicalDocumentLintRule,
  isMorphologicalLintRule,
} from "@/lib/linting/types";
import type { LintIssue, LintRuleConfig } from "@/lib/linting/types";

import {
  WorkerDisposedError,
  WorkerStaleError,
  type RuleRunnerLike,
  type RunBatchRequest,
  type RunBatchResponse,
  type SerializedIssueMap,
  type WorkerEvent,
  type WorkerRequest,
} from "./protocol";

interface PendingRequest {
  resolve: (response: RunBatchResponse) => void;
  reject: (err: Error) => void;
  version: number;
  /** Per-paragraph issues already computed on the main thread (morph rules). */
  mainPerParagraph: Map<number, LintIssue[]>;
  /** Document-level issues already computed on the main thread (morph doc rules). */
  mainDocument: Map<number, LintIssue[]>;
}

/**
 * Worker factory. Exposed for tests that want to inject a fake.
 * The default uses Vite/Webpack's URL-based worker bundling.
 */
export type WorkerFactory = () => Worker;

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL("./linting.worker.ts", import.meta.url), {
    type: "module",
  });

export class RuleRunnerProxy implements RuleRunnerLike {
  private readonly worker: Worker;
  private readonly mainRunner: RuleRunner;
  /** True iff any worker-side rule is a `DocumentLintRule`. Computed at construction. */
  private readonly workerHasDocumentRules: boolean;

  private nextCorrelationId = 1;
  private latestRequestedVersion = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly preReadyBuffer: WorkerRequest[] = [];

  private ready = false;
  private disposed = false;

  /** Promise that resolves once the worker has posted READY. */
  readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (err: Error) => void;

  constructor(factory: WorkerFactory = defaultWorkerFactory) {
    // 1. Build the main-side runner with morph rules only.
    this.mainRunner = new RuleRunner();
    for (const rule of getAllRules()) {
      if (isMorphologicalLintRule(rule) || isMorphologicalDocumentLintRule(rule)) {
        this.mainRunner.registerRule(rule);
      }
    }
    this.mainRunner.setGuidelineMap(RULE_GUIDELINE_MAP);

    // 2. Pre-compute worker capability flags from rule metadata so
    //    `hasDocumentRules()` can answer synchronously.
    this.workerHasDocumentRules = createJsonDrivenRules().some(
      (r) =>
        isDocumentLintRule(r) && !isMorphologicalLintRule(r) && !isMorphologicalDocumentLintRule(r),
    );

    // 3. Spin up the worker.
    this.worker = factory();
    this.worker.onmessage = (e: MessageEvent<WorkerEvent>) => this.handleEvent(e.data);
    this.worker.onerror = (e) => this.handleWorkerError(e);
    this.worker.onmessageerror = () => this.handleWorkerError(new Error("Worker messageerror"));

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  // ----------------------------------------------------------------
  // RuleRunnerLike — sync metadata methods
  // ----------------------------------------------------------------

  setConfig(ruleId: string, config: LintRuleConfig): void {
    if (this.disposed) return;
    this.mainRunner.setConfig(ruleId, config);
    this.send({
      type: "SET_CONFIG",
      correlationId: this.nextId(),
      ruleId,
      config,
    });
  }

  setActiveGuidelines(guidelines: string[] | null): void {
    if (this.disposed) return;
    this.mainRunner.setActiveGuidelines(guidelines);
    this.send({
      type: "SET_ACTIVE_GUIDELINES",
      correlationId: this.nextId(),
      guidelines,
    });
  }

  setGuidelineMap(map: Map<string, string | undefined>): void {
    if (this.disposed) return;
    this.mainRunner.setGuidelineMap(map);
    this.send({
      type: "SET_GUIDELINE_MAP",
      correlationId: this.nextId(),
      entries: Array.from(map.entries()),
    });
  }

  hasMorphologicalRules(): boolean {
    return this.mainRunner.hasMorphologicalRules();
  }

  hasDocumentRules(): boolean {
    return this.workerHasDocumentRules || this.mainRunner.hasDocumentRules();
  }

  hasMorphologicalDocumentRules(): boolean {
    return this.mainRunner.hasMorphologicalDocumentRules();
  }

  // ----------------------------------------------------------------
  // RuleRunnerLike — async batch execution
  // ----------------------------------------------------------------

  async runBatch(req: RunBatchRequest): Promise<RunBatchResponse> {
    if (this.disposed) {
      throw new WorkerDisposedError();
    }

    // Track the latest version requested so older responses can be filtered.
    if (req.version > this.latestRequestedVersion) {
      this.latestRequestedVersion = req.version;
    }

    // Eagerly cancel any pending request with a lower version — the
    // caller no longer cares about it.
    for (const [id, entry] of this.pending) {
      if (entry.version < this.latestRequestedVersion) {
        this.pending.delete(id);
        entry.reject(new WorkerStaleError());
      }
    }

    // Run main-thread morph rules synchronously while the worker is busy.
    const { mainPerParagraph, mainDocument } = this.runMainMorph(req);

    const runWorker = req.runWorker !== false;
    if (!runWorker) {
      return { perParagraph: mainPerParagraph, document: mainDocument };
    }

    // Wait for worker startup if it hasn't readied yet. If `dispose()`
    // beats READY, this rejects with `WorkerDisposedError`.
    if (!this.ready) {
      try {
        await this.readyPromise;
      } catch (err) {
        if (err instanceof WorkerDisposedError) throw err;
        throw err;
      }
    }

    if (this.disposed) {
      throw new WorkerDisposedError();
    }

    const correlationId = this.nextId();
    const workerResponse = new Promise<RunBatchResponse>((resolve, reject) => {
      this.pending.set(correlationId, {
        resolve,
        reject,
        version: req.version,
        mainPerParagraph,
        mainDocument,
      });
    });

    this.send({
      type: "RUN_BATCH",
      correlationId,
      version: req.version,
      paragraphs: req.paragraphs.map((p) => ({ text: p.text, index: p.index })),
      mode: req.mode,
    });

    return workerResponse;
  }

  cancelInFlight(): void {
    const err = new WorkerStaleError();
    for (const entry of this.pending.values()) {
      entry.reject(err);
    }
    this.pending.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const err = new WorkerDisposedError();
    for (const entry of this.pending.values()) {
      entry.reject(err);
    }
    this.pending.clear();
    this.preReadyBuffer.length = 0;
    if (!this.ready) {
      // Reject the readyPromise so any awaiter unwinds cleanly.
      this.rejectReady(err);
    }

    this.worker.terminate();
  }

  // ----------------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------------

  private nextId(): number {
    return this.nextCorrelationId++;
  }

  private send(msg: WorkerRequest): void {
    if (this.disposed) return;
    if (!this.ready) {
      this.preReadyBuffer.push(msg);
      return;
    }
    this.worker.postMessage(msg);
  }

  private handleEvent(evt: WorkerEvent): void {
    switch (evt.type) {
      case "READY": {
        this.ready = true;
        this.resolveReady();
        // Flush buffered messages in FIFO order.
        for (const msg of this.preReadyBuffer) {
          this.worker.postMessage(msg);
        }
        this.preReadyBuffer.length = 0;
        return;
      }
      case "RESPONSE": {
        const entry = this.pending.get(evt.correlationId);
        if (!entry) return;
        this.pending.delete(evt.correlationId);

        // Stale-by-version filtering.
        if (evt.version < this.latestRequestedVersion) {
          entry.reject(new WorkerStaleError());
          return;
        }

        // Merge worker results with the main-thread morph results.
        const merged: RunBatchResponse = {
          perParagraph: mergeIssueMaps(entry.mainPerParagraph, deserialize(evt.perParagraph)),
          document: mergeIssueMaps(entry.mainDocument, deserialize(evt.document)),
        };
        entry.resolve(merged);
        return;
      }
      case "ERROR": {
        const err = new Error(evt.error.message);
        err.name = evt.error.name;
        if (evt.correlationId !== undefined) {
          const entry = this.pending.get(evt.correlationId);
          if (entry) {
            this.pending.delete(evt.correlationId);
            entry.reject(err);
          }
        } else {
          // No correlation — propagate to all pending so callers learn
          // the worker failed.
          for (const entry of this.pending.values()) {
            entry.reject(err);
          }
          this.pending.clear();
        }
        return;
      }
      default: {
        const _exhaustive: never = evt;
        void _exhaustive;
      }
    }
  }

  private handleWorkerError(e: ErrorEvent | Error): void {
    const err = e instanceof Error ? e : new Error(e.message ?? String(e));
    for (const entry of this.pending.values()) {
      entry.reject(err);
    }
    this.pending.clear();
    if (!this.ready) {
      this.rejectReady(err);
    }
  }

  private runMainMorph(req: RunBatchRequest): {
    mainPerParagraph: Map<number, LintIssue[]>;
    mainDocument: Map<number, LintIssue[]>;
  } {
    const mainPerParagraph = new Map<number, LintIssue[]>();
    const mainDocument = new Map<number, LintIssue[]>();

    if (!this.mainRunner.hasMorphologicalRules() && !this.mainRunner.hasDocumentRules()) {
      return { mainPerParagraph, mainDocument };
    }

    const runPer = req.mode === "per-paragraph" || req.mode === "both";
    const runDoc = req.mode === "document" || req.mode === "both";

    // Per-paragraph morph rules.
    if (runPer) {
      for (const p of req.paragraphs) {
        if (!p.tokens) continue; // morph rules need tokens
        const issues = this.mainRunner.runAllWithTokens(p.text, p.tokens);
        if (issues.length > 0) mainPerParagraph.set(p.index, issues);
      }
    }

    // Document-level morph rules.
    if (runDoc && this.mainRunner.hasDocumentRules()) {
      const docInputs = req.paragraphs
        .filter((p) => p.tokens != null)
        .map((p) => ({ text: p.text, index: p.index, tokens: p.tokens! }));
      if (docInputs.length > 0) {
        const docResults = this.mainRunner.runDocumentWithTokens(docInputs);
        docResults.forEach((issues, idx) => {
          if (issues.length > 0) mainDocument.set(idx, issues);
        });
      }
    }

    return { mainPerParagraph, mainDocument };
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function deserialize(entries: SerializedIssueMap): Map<number, LintIssue[]> {
  const map = new Map<number, LintIssue[]>();
  for (const [idx, issues] of entries) {
    if (issues.length > 0) map.set(idx, issues);
  }
  return map;
}

function mergeIssueMaps(
  a: Map<number, LintIssue[]>,
  b: Map<number, LintIssue[]>,
): Map<number, LintIssue[]> {
  if (a.size === 0) return b;
  if (b.size === 0) return a;
  const out = new Map<number, LintIssue[]>(a);
  for (const [idx, issues] of b) {
    const existing = out.get(idx);
    out.set(idx, existing ? [...existing, ...issues] : issues);
  }
  return out;
}
