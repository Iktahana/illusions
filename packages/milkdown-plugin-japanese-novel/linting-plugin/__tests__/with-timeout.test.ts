/**
 * Tests for `withTimeout` — the time-boxing helper that keeps a stalled IPC
 * pre-step (NLP tokenization / dictionary prewarm) from blocking the lint batch
 * and zeroing out L1 detection in the packaged main-thread fallback (#1964).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout } from "../decoration-plugin";

describe("withTimeout (#1964 lint fallback guard)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves to the promise value when it settles within the budget", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000, "fallback");
    expect(result).toBe("ok");
  });

  it("resolves to the fallback when the promise never settles (stall)", async () => {
    vi.useFakeTimers();
    // A promise that never resolves — the packaged-renderer IPC hang scenario.
    const neverSettles = new Promise<string>(() => {});
    const raced = withTimeout(neverSettles, 5000, "fallback");
    await vi.advanceTimersByTimeAsync(5000);
    await expect(raced).resolves.toBe("fallback");
  });

  it("does not resolve before the budget elapses on a stall", async () => {
    vi.useFakeTimers();
    const neverSettles = new Promise<string>(() => {});
    const raced = withTimeout(neverSettles, 5000, "fallback");
    let settled = false;
    void raced.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(raced).resolves.toBe("fallback");
  });

  it("resolves to the fallback when the promise rejects", async () => {
    const result = await withTimeout(Promise.reject(new Error("boom")), 1000, "fallback");
    expect(result).toBe("fallback");
  });

  it("resolves to the fallback immediately when ms <= 0", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 0, "fallback");
    expect(result).toBe("fallback");
  });

  it("ignores a late resolution after the timeout has already fired", async () => {
    vi.useFakeTimers();
    let resolveLate!: (value: string) => void;
    const late = new Promise<string>((resolve) => {
      resolveLate = resolve;
    });
    const raced = withTimeout(late, 1000, "fallback");
    await vi.advanceTimersByTimeAsync(1000);
    // The underlying promise settles after the race already returned the fallback.
    resolveLate("too-late");
    await expect(raced).resolves.toBe("fallback");
  });

  it("works with a unique sentinel fallback (tokenize-timeout pattern)", async () => {
    vi.useFakeTimers();
    const TIMED_OUT = Symbol("timeout");
    const neverSettles = new Promise<number[]>(() => {});
    const raced = withTimeout<number[] | typeof TIMED_OUT>(neverSettles, 5000, TIMED_OUT);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(raced).resolves.toBe(TIMED_OUT);
  });
});
