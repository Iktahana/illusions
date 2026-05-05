/**
 * Tests for `RuleRunnerProxy`.
 *
 * Mocks the `Worker` constructor and drives the proxy synchronously
 * through fake post-message events. Exercises the round-trip,
 * stale-by-version filtering, `cancelInFlight`, and the
 * dispose-before-READY path.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RuleRunnerProxy } from "../rule-runner-proxy";
import {
  type WorkerEvent,
  type WorkerRequest,
  WorkerDisposedError,
  WorkerStaleError,
} from "../protocol";
import type { LintIssue } from "@/lib/linting/types";

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
});
