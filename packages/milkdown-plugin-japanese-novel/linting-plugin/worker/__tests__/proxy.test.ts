/**
 * Tests for `RuleRunnerProxy`.
 *
 * Mocks the `Worker` constructor and drives the proxy synchronously
 * through fake post-message events. Exercises the round-trip,
 * stale-by-version filtering, `cancelInFlight`, and the
 * dispose-before-READY path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { RuleRunnerProxy } from "../rule-runner-proxy";
import {
  type BatchParagraph,
  type WorkerEvent,
  type WorkerRequest,
  WorkerDisposedError,
  WorkerStaleError,
} from "../protocol";
import type { LintIssue } from "@/lib/linting/types";
import { makeModule } from "@/lib/linting/registry/__tests__/ruleset-fixtures";

// Mock only the blob-import helper — jsdom/node can't `import(blob:)`.
// `buildRulesetRunner` / `createIsolatedRulesetContext` stay real so the
// main-thread fallback genuinely builds and runs rules.
vi.mock("../build-ruleset-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../build-ruleset-runner")>();
  return { ...actual, importRulesetModule: vi.fn() };
});
import { importRulesetModule } from "../build-ruleset-runner";

// ----------------------------------------------------------------
// Fake Worker
// ----------------------------------------------------------------

class FakeWorker {
  onmessage: ((e: MessageEvent<WorkerEvent>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  /** All messages the proxy has posted into the worker, in order. */
  readonly received: WorkerRequest[] = [];
  terminated = false;

  postMessage(msg: WorkerRequest): void {
    this.received.push(msg);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Helper for tests: deliver a fake event to the proxy. */
  emit(evt: WorkerEvent): void {
    this.onmessage?.(new MessageEvent("message", { data: evt }));
  }
}

let fakeWorker: FakeWorker;

beforeEach(() => {
  fakeWorker = new FakeWorker();
});

afterEach(() => {
  fakeWorker.terminate();
});

function makeProxy(): RuleRunnerProxy {
  return new RuleRunnerProxy(() => fakeWorker as unknown as Worker);
}

function emitReady(): void {
  fakeWorker.emit({ type: "READY" });
}

function fakeIssue(ruleId: string, from = 0, to = 1): LintIssue {
  return {
    ruleId,
    severity: "warning",
    message: "test",
    messageJa: "テスト",
    from,
    to,
  };
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe("RuleRunnerProxy", () => {
  it("buffers config messages until READY, then flushes them", () => {
    const proxy = makeProxy();
    proxy.setConfig("rule-x", { enabled: true, severity: "warning" });
    expect(fakeWorker.received).toHaveLength(0);
    emitReady();
    expect(fakeWorker.received).toHaveLength(1);
    expect(fakeWorker.received[0].type).toBe("SET_CONFIG");
    proxy.dispose();
  });

  it("round-trips a runBatch request and resolves with worker issues", async () => {
    const proxy = makeProxy();
    emitReady();

    const promise = proxy.runBatch({
      paragraphs: [{ text: "hello", index: 0 }],
      mode: "per-paragraph",
      version: 1,
    });

    // Worker message was posted with mode = per-paragraph.
    const sentRunBatch = fakeWorker.received.find((m) => m.type === "RUN_BATCH");
    expect(sentRunBatch).toBeDefined();
    expect(sentRunBatch?.type === "RUN_BATCH" && sentRunBatch.mode).toBe("per-paragraph");

    // Worker replies.
    const correlationId = sentRunBatch?.type === "RUN_BATCH" ? sentRunBatch.correlationId : -1;
    fakeWorker.emit({
      type: "RESPONSE",
      correlationId,
      version: 1,
      perParagraph: [[0, [fakeIssue("rule-a")]]],
      document: [],
    });

    const resp = await promise;
    expect(resp.perParagraph.get(0)).toEqual([fakeIssue("rule-a")]);
    expect(resp.document.size).toBe(0);

    proxy.dispose();
  });

  it("rejects stale-by-version responses with WorkerStaleError", async () => {
    const proxy = makeProxy();
    emitReady();

    // Start version 1, then version 2 — version 1's pending entry should
    // be cancelled eagerly when v2 arrives.
    const v1Promise = proxy
      .runBatch({ paragraphs: [], mode: "per-paragraph", version: 1 })
      .catch((e) => e);
    const v2Promise = proxy
      .runBatch({ paragraphs: [], mode: "per-paragraph", version: 2 })
      .catch((e) => e);

    // v1 should already be rejected (eager cancel).
    const v1 = await v1Promise;
    expect(v1).toBeInstanceOf(WorkerStaleError);

    // v2 is still pending; deliver its response.
    const v2BatchMsg = fakeWorker.received.filter(
      (m) => m.type === "RUN_BATCH" && m.version === 2,
    )[0];
    if (v2BatchMsg?.type !== "RUN_BATCH") throw new Error("unreachable");
    fakeWorker.emit({
      type: "RESPONSE",
      correlationId: v2BatchMsg.correlationId,
      version: 2,
      perParagraph: [],
      document: [],
    });

    const v2 = await v2Promise;
    expect(v2 instanceof Error).toBe(false); // resolved, not rejected
    proxy.dispose();
  });

  it("cancelInFlight rejects all pending with WorkerStaleError but keeps the worker alive", async () => {
    const proxy = makeProxy();
    emitReady();

    const promise = proxy
      .runBatch({ paragraphs: [], mode: "per-paragraph", version: 1 })
      .catch((e) => e);

    proxy.cancelInFlight();
    const result = await promise;
    expect(result).toBeInstanceOf(WorkerStaleError);
    expect(fakeWorker.terminated).toBe(false);

    // Subsequent runBatch should still work.
    const next = proxy.runBatch({ paragraphs: [], mode: "per-paragraph", version: 2 });
    const batchMsg = fakeWorker.received.find((m) => m.type === "RUN_BATCH" && m.version === 2);
    if (batchMsg?.type !== "RUN_BATCH") throw new Error("unreachable");
    fakeWorker.emit({
      type: "RESPONSE",
      correlationId: batchMsg.correlationId,
      version: 2,
      perParagraph: [],
      document: [],
    });
    await expect(next).resolves.toBeDefined();
    proxy.dispose();
  });

  it("dispose-before-READY rejects pending runBatch with WorkerDisposedError", async () => {
    const proxy = makeProxy();
    // Don't emit READY.
    const promise = proxy
      .runBatch({ paragraphs: [], mode: "per-paragraph", version: 1 })
      .catch((e) => e);

    proxy.dispose();
    const result = await promise;
    expect(result).toBeInstanceOf(WorkerDisposedError);
    expect(fakeWorker.terminated).toBe(true);
  });

  it("cancelInFlight while runBatch is awaiting READY rejects the batch and never posts to the worker", async () => {
    const proxy = makeProxy();
    // Do NOT emit READY — runBatch should park its pending entry while
    // awaiting the readyPromise.
    const promise = proxy
      .runBatch({
        paragraphs: [{ text: "x", index: 0 }],
        mode: "per-paragraph",
        version: 1,
      })
      .catch((e) => e);

    // Cancel before the worker is ready. The pending entry must already
    // exist — otherwise cancelInFlight has nothing to reject.
    proxy.cancelInFlight();

    // Now flush READY. The proxy must NOT post the cancelled batch to
    // the worker.
    emitReady();
    // Yield once so any post-await microtasks settle.
    await Promise.resolve();
    await Promise.resolve();

    const result = await promise;
    expect(result).toBeInstanceOf(WorkerStaleError);
    const sentBatches = fakeWorker.received.filter((m) => m.type === "RUN_BATCH");
    expect(sentBatches).toHaveLength(0);

    proxy.dispose();
  });

  it("uncorrelated ERROR before READY falls back to main-thread linting instead of hanging (#1831)", async () => {
    const proxy = makeProxy();
    // Do NOT emit READY. Send an uncorrelated ERROR (worker startup failed —
    // e.g. file:// null-origin chunk resolution in packaged Electron).
    fakeWorker.emit({
      type: "ERROR",
      error: { name: "WorkerError", message: "init failed" },
    });

    // The proxy now runs on the main thread. runBatch resolves (no rulesets
    // loaded → empty) rather than rejecting or hanging.
    const resp = await proxy.runBatch({
      paragraphs: [{ text: "テスト", index: 0 }],
      mode: "per-paragraph",
      version: 1,
    });
    expect(resp.perParagraph.size).toBe(0);
    expect(fakeWorker.terminated).toBe(true);

    proxy.dispose();
  });

  it("uncorrelated ERROR after READY falls back to main-thread linting (#1831)", async () => {
    const proxy = makeProxy();
    emitReady();

    fakeWorker.emit({
      type: "ERROR",
      error: { name: "WorkerError", message: "post-ready boom" },
    });

    const resp = await proxy.runBatch({
      paragraphs: [{ text: "テスト", index: 0 }],
      mode: "per-paragraph",
      version: 1,
    });
    expect(resp.perParagraph.size).toBe(0);
    expect(fakeWorker.terminated).toBe(true);

    proxy.dispose();
  });

  it("worker.onerror falls back to main-thread linting (#1831)", async () => {
    const proxy = makeProxy();
    emitReady();

    // Simulate the underlying Worker emitting an `error` event.
    fakeWorker.onerror?.(new ErrorEvent("error", { message: "worker crashed" }));

    const resp = await proxy.runBatch({
      paragraphs: [{ text: "テスト", index: 0 }],
      mode: "per-paragraph",
      version: 1,
    });
    expect(resp.perParagraph.size).toBe(0);
    expect(fakeWorker.terminated).toBe(true);

    proxy.dispose();
  });

  it("propagates worker ERROR with correlationId to the matching pending request", async () => {
    const proxy = makeProxy();
    emitReady();

    const promise = proxy
      .runBatch({ paragraphs: [], mode: "per-paragraph", version: 1 })
      .catch((e) => e);

    const batchMsg = fakeWorker.received.find((m) => m.type === "RUN_BATCH");
    if (batchMsg?.type !== "RUN_BATCH") throw new Error("unreachable");
    fakeWorker.emit({
      type: "ERROR",
      correlationId: batchMsg.correlationId,
      error: { name: "RuleError", message: "boom" },
    });

    const err = await promise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("RuleError");
    expect((err as Error).message).toBe("boom");
    proxy.dispose();
  });

  // ----------------------------------------------------------------
  // External L2 (morphological) token forwarding — option (c) wiring.
  // External rulesets run inside the worker; their L2 rules need kuromoji
  // tokens, which only the main thread can compute. The proxy must learn
  // (via RULESET_LOADED) that the worker hosts morph rules, report
  // hasMorphologicalRules() so the decoration plugin tokenizes, and then
  // forward those tokens to the worker in RUN_BATCH.
  // ----------------------------------------------------------------

  const fakeTokens = [{ surface: "走っ" }, { surface: "た" }] as unknown as NonNullable<
    BatchParagraph["tokens"]
  >;

  it("omits tokens from RUN_BATCH when the worker hosts no morphological rules", () => {
    const proxy = makeProxy();
    emitReady();

    expect(proxy.hasMorphologicalRules()).toBe(false);

    // RUN_BATCH is posted synchronously once READY; swallow the
    // dispose-time rejection so it doesn't surface as unhandled.
    proxy
      .runBatch({
        paragraphs: [{ text: "走った", index: 0, tokens: fakeTokens }],
        mode: "per-paragraph",
        version: 1,
      })
      .catch(() => {});

    const sent = fakeWorker.received.find((m) => m.type === "RUN_BATCH");
    if (sent?.type !== "RUN_BATCH") throw new Error("unreachable");
    // L1-only path: tokens stripped to keep the payload small.
    expect(sent.paragraphs[0].tokens).toBeUndefined();
    proxy.dispose();
  });

  it("reports hasMorphologicalRules() and forwards tokens after an external L2 ruleset loads", async () => {
    const proxy = makeProxy();
    emitReady();

    const loadPromise = proxy.loadRuleset("com.example.l2", "/* code */");
    const loadMsg = fakeWorker.received.find((m) => m.type === "LOAD_RULESET");
    if (loadMsg?.type !== "LOAD_RULESET") throw new Error("unreachable");

    // Worker rebuilt its runner and now hosts a registered morph rule.
    fakeWorker.emit({
      type: "RULESET_LOADED",
      correlationId: loadMsg.correlationId,
      id: "com.example.l2",
      ok: true,
      ruleIds: ["ex-morph-1"],
      warnings: [],
      hasMorphologicalRules: true,
      hasDictRules: false,
    });
    await loadPromise;

    // Decoration plugin now sees morph rules → tokenizes.
    expect(proxy.hasMorphologicalRules()).toBe(true);

    proxy
      .runBatch({
        paragraphs: [{ text: "走った", index: 0, tokens: fakeTokens }],
        mode: "per-paragraph",
        version: 1,
      })
      .catch(() => {});

    const sent = fakeWorker.received.find((m) => m.type === "RUN_BATCH");
    if (sent?.type !== "RUN_BATCH") throw new Error("unreachable");
    expect(sent.paragraphs[0].tokens).toBe(fakeTokens);
    proxy.dispose();
  });

  it("stops forwarding tokens after the external L2 ruleset is unloaded", async () => {
    const proxy = makeProxy();
    emitReady();

    // Load → morph present.
    const loadPromise = proxy.loadRuleset("com.example.l2", "/* code */");
    const loadMsg = fakeWorker.received.find((m) => m.type === "LOAD_RULESET");
    if (loadMsg?.type !== "LOAD_RULESET") throw new Error("unreachable");
    fakeWorker.emit({
      type: "RULESET_LOADED",
      correlationId: loadMsg.correlationId,
      id: "com.example.l2",
      ok: true,
      ruleIds: ["ex-morph-1"],
      warnings: [],
      hasMorphologicalRules: true,
      hasDictRules: false,
    });
    await loadPromise;
    expect(proxy.hasMorphologicalRules()).toBe(true);

    // Unload → worker rebuilds without morph rules.
    const unloadPromise = proxy.unloadRuleset("com.example.l2");
    const unloadMsg = fakeWorker.received.find((m) => m.type === "UNLOAD_RULESET");
    if (unloadMsg?.type !== "UNLOAD_RULESET") throw new Error("unreachable");
    fakeWorker.emit({
      type: "RULESET_LOADED",
      correlationId: unloadMsg.correlationId,
      id: "com.example.l2",
      ok: true,
      ruleIds: [],
      warnings: [],
      hasMorphologicalRules: false,
      hasDictRules: false,
    });
    await unloadPromise;

    expect(proxy.hasMorphologicalRules()).toBe(false);

    proxy
      .runBatch({
        paragraphs: [{ text: "走った", index: 0, tokens: fakeTokens }],
        mode: "per-paragraph",
        version: 2,
      })
      .catch(() => {});

    const batches = fakeWorker.received.filter((m) => m.type === "RUN_BATCH");
    const last = batches[batches.length - 1];
    if (last?.type !== "RUN_BATCH") throw new Error("unreachable");
    expect(last.paragraphs[0].tokens).toBeUndefined();
    proxy.dispose();
  });

  // ----------------------------------------------------------------
  // Main-thread fallback rule execution (#1831)
  //
  // When the worker can't start (packaged Electron file:// null-origin),
  // the proxy imports every loaded ruleset on the main thread and runs
  // them there. The fixture rule flags the full-width "！".
  // ----------------------------------------------------------------

  describe("main-thread fallback (#1831)", () => {
    beforeEach(() => {
      vi.mocked(importRulesetModule).mockReset();
    });

    it("applies a ruleset loaded before the worker fails on the main thread", async () => {
      vi.mocked(importRulesetModule).mockResolvedValue(
        makeModule({ id: "com.example.bang", ruleIds: ["bang-rule"] }),
      );

      const proxy = makeProxy();
      // Load the ruleset while the worker is still (apparently) starting.
      const loadPromise = proxy.loadRuleset("com.example.bang", "/* code */");

      // Worker startup fails → fallback kicks in and resolves the load.
      fakeWorker.emit({
        type: "ERROR",
        error: { name: "WorkerError", message: "startup failed" },
      });

      const loadResult = await loadPromise;
      expect(loadResult.ok).toBe(true);

      const resp = await proxy.runBatch({
        paragraphs: [{ text: "これはダメ！", index: 0 }],
        mode: "per-paragraph",
        version: 1,
      });
      const issues = resp.perParagraph.get(0);
      expect(issues?.length).toBe(1);
      expect(issues?.[0].ruleId).toBe("bang-rule");
      expect(fakeWorker.terminated).toBe(true);

      proxy.dispose();
    });

    it("loads a ruleset on the main thread after fallback is already active", async () => {
      vi.mocked(importRulesetModule).mockResolvedValue(
        makeModule({ id: "com.example.bang", ruleIds: ["bang-rule"] }),
      );

      const proxy = makeProxy();
      // Trigger fallback first (no rulesets yet).
      fakeWorker.onerror?.(new ErrorEvent("error", { message: "crash" }));

      const loadResult = await proxy.loadRuleset("com.example.bang", "/* code */");
      expect(loadResult.ok).toBe(true);
      expect(loadResult.ruleIds).toContain("bang-rule");

      const resp = await proxy.runBatch({
        paragraphs: [{ text: "わっ！", index: 0 }],
        mode: "per-paragraph",
        version: 1,
      });
      expect(resp.perParagraph.get(0)?.[0].ruleId).toBe("bang-rule");

      proxy.dispose();
    });

    it("honors disable config in the fallback runner", async () => {
      vi.mocked(importRulesetModule).mockResolvedValue(
        makeModule({ id: "com.example.bang", ruleIds: ["bang-rule"] }),
      );

      const proxy = makeProxy();
      fakeWorker.onerror?.(new ErrorEvent("error", { message: "crash" }));
      await proxy.loadRuleset("com.example.bang", "/* code */");

      // Disable the rule — fallback runner must respect it.
      proxy.setConfig("bang-rule", { enabled: false, severity: "warning" });

      const resp = await proxy.runBatch({
        paragraphs: [{ text: "ダメ！", index: 0 }],
        mode: "per-paragraph",
        version: 1,
      });
      expect(resp.perParagraph.size).toBe(0);

      proxy.dispose();
    });

    it("unloads a ruleset from the fallback runner", async () => {
      vi.mocked(importRulesetModule).mockResolvedValue(
        makeModule({ id: "com.example.bang", ruleIds: ["bang-rule"] }),
      );

      const proxy = makeProxy();
      fakeWorker.onerror?.(new ErrorEvent("error", { message: "crash" }));
      await proxy.loadRuleset("com.example.bang", "/* code */");
      await proxy.unloadRuleset("com.example.bang");

      const resp = await proxy.runBatch({
        paragraphs: [{ text: "ダメ！", index: 0 }],
        mode: "per-paragraph",
        version: 1,
      });
      expect(resp.perParagraph.size).toBe(0);

      proxy.dispose();
    });
  });
});
