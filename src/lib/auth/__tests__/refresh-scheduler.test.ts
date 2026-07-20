/**
 * Tests for the auth refresh scheduler (#1437 refactor, #1567 fix).
 *
 * Locks two contracts:
 * - The retry floor (60s) and the 5-minute refresh lead are unchanged.
 * - `dispose()` cancels the pending timer AND turns any later `schedule()`
 *   into a no-op, so async work resolving after unmount can never leave an
 *   uncancellable timer behind (#1567).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeRefreshDelay,
  createRefreshScheduler,
  REFRESH_LEAD_MS,
  TRANSIENT_RETRY_MIN_MS,
} from "../refresh-scheduler";

describe("computeRefreshDelay", () => {
  it("schedules 5 minutes before expiry for a healthy token", () => {
    const now = 1_000_000;
    const expiresAt = now + 60 * 60 * 1000; // 1 hour
    expect(computeRefreshDelay(expiresAt, now)).toBe(60 * 60 * 1000 - REFRESH_LEAD_MS);
  });

  it("applies the 60s retry floor when the token already expired", () => {
    const now = 1_000_000;
    expect(computeRefreshDelay(now - 1000, now)).toBe(TRANSIENT_RETRY_MIN_MS);
  });

  it("applies the floor when expiry is within the refresh lead", () => {
    const now = 1_000_000;
    const expiresAt = now + REFRESH_LEAD_MS - 1; // less than 5 minutes left
    expect(computeRefreshDelay(expiresAt, now)).toBe(TRANSIENT_RETRY_MIN_MS);
  });
});

describe("createRefreshScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the task once after the computed delay", () => {
    const scheduler = createRefreshScheduler();
    const task = vi.fn();
    scheduler.schedule(Date.now() + 60 * 60 * 1000, task);

    vi.advanceTimersByTime(60 * 60 * 1000 - REFRESH_LEAD_MS - 1);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("replaces the pending timer on re-schedule (only one timer at a time)", () => {
    const scheduler = createRefreshScheduler();
    const first = vi.fn();
    const second = vi.fn();
    scheduler.schedule(Date.now() + 10 * 60 * 1000, first);
    scheduler.schedule(Date.now() + 10 * 60 * 1000, second);
    expect(vi.getTimerCount()).toBe(1);

    vi.runAllTimers();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("clear() cancels the pending timer but keeps the scheduler usable (logout)", () => {
    const scheduler = createRefreshScheduler();
    const task = vi.fn();
    scheduler.schedule(Date.now() + 10 * 60 * 1000, task);
    scheduler.clear();
    expect(vi.getTimerCount()).toBe(0);

    // A later login can schedule again.
    scheduler.schedule(Date.now() + 10 * 60 * 1000, task);
    expect(vi.getTimerCount()).toBe(1);
    vi.runAllTimers();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("dispose() cancels the pending timer (unmount)", () => {
    const scheduler = createRefreshScheduler();
    scheduler.schedule(Date.now() + 10 * 60 * 1000, vi.fn());
    scheduler.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dispose() makes later schedule() calls a no-op (#1567 late async restore)", () => {
    const scheduler = createRefreshScheduler();
    scheduler.dispose();

    const task = vi.fn();
    scheduler.schedule(Date.now() + 10 * 60 * 1000, task);
    expect(vi.getTimerCount()).toBe(0);

    vi.runAllTimers();
    expect(task).not.toHaveBeenCalled();
  });
});
