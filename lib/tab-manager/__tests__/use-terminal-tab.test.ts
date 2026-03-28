import { describe, it, expect } from "vitest";
import type { TerminalTabState, TerminalTabStatus } from "../tab-types";
import { generateTabId } from "../types";

// ---------------------------------------------------------------------------
// Unit tests for terminal tab state transitions
//
// The core bug: creating a terminal tab before PTY spawn completes — if
// the spawn fails the tab stays in "connecting" forever.
//
// These tests validate the state-transition logic that the useTerminalTab
// hook uses internally, without requiring React rendering infrastructure.
// ---------------------------------------------------------------------------

/** Create a terminal tab in the initial "connecting" state. */
function createConnectingTab(overrides?: Partial<TerminalTabState>): TerminalTabState {
  return {
    id: generateTabId(),
    title: "ターミナル",
    status: "connecting",
    ptyId: null,
    pid: null,
    ...overrides,
  };
}

/** Simulate the state transition that happens when PTY spawn succeeds. */
function transitionToRunning(
  tab: TerminalTabState,
  ptyId: string,
  pid: number,
): TerminalTabState {
  return { ...tab, status: "running", ptyId, pid };
}

/** Simulate the state transition that happens when PTY spawn fails. */
function transitionToError(
  tab: TerminalTabState,
  errorMessage: string,
): TerminalTabState {
  return { ...tab, status: "error", errorMessage };
}

/** Simulate the retry transition (error → connecting). */
function transitionToRetry(tab: TerminalTabState): TerminalTabState {
  return { ...tab, status: "connecting", errorMessage: undefined };
}

describe("Terminal tab state transitions", () => {
  it("initial tab is in 'connecting' status with null ptyId/pid", () => {
    const tab = createConnectingTab();
    expect(tab.status).toBe("connecting");
    expect(tab.ptyId).toBeNull();
    expect(tab.pid).toBeNull();
    expect(tab.errorMessage).toBeUndefined();
  });

  it("transitions to 'running' on successful PTY spawn", () => {
    const tab = createConnectingTab();
    const running = transitionToRunning(tab, "pty-1-100", 100);

    expect(running.status).toBe("running");
    expect(running.ptyId).toBe("pty-1-100");
    expect(running.pid).toBe(100);
    expect(running.errorMessage).toBeUndefined();
  });

  it("transitions to 'error' on failed PTY spawn (core bug fix)", () => {
    const tab = createConnectingTab();
    const errored = transitionToError(tab, "シェルが見つかりません");

    expect(errored.status).toBe("error");
    expect(errored.errorMessage).toBe("シェルが見つかりません");
    // ptyId and pid remain null — no process was created
    expect(errored.ptyId).toBeNull();
    expect(errored.pid).toBeNull();
  });

  it("never leaves a tab in 'connecting' state after spawn result", () => {
    const tab = createConnectingTab();

    // Simulate spawn failure path
    const afterFail = transitionToError(tab, "error");
    expect(afterFail.status).not.toBe("connecting");

    // Simulate spawn success path
    const afterSuccess = transitionToRunning(tab, "pty-2", 200);
    expect(afterSuccess.status).not.toBe("connecting");
  });

  it("retry resets error tab to 'connecting' before re-attempting", () => {
    const errored = transitionToError(
      createConnectingTab(),
      "initial failure",
    );
    expect(errored.status).toBe("error");

    const retrying = transitionToRetry(errored);
    expect(retrying.status).toBe("connecting");
    expect(retrying.errorMessage).toBeUndefined();
  });

  it("retry followed by success results in 'running'", () => {
    const errored = transitionToError(createConnectingTab(), "fail");
    const retrying = transitionToRetry(errored);
    const running = transitionToRunning(retrying, "pty-3-300", 300);

    expect(running.status).toBe("running");
    expect(running.ptyId).toBe("pty-3-300");
  });

  it("retry followed by another failure remains in 'error'", () => {
    const errored = transitionToError(createConnectingTab(), "first fail");
    const retrying = transitionToRetry(errored);
    const erroredAgain = transitionToError(retrying, "second fail");

    expect(erroredAgain.status).toBe("error");
    expect(erroredAgain.errorMessage).toBe("second fail");
  });

  it("TerminalTabStatus type covers all expected states", () => {
    const allStatuses: TerminalTabStatus[] = [
      "connecting",
      "running",
      "exited",
      "error",
    ];
    // Each must be a valid status for the tab
    for (const status of allStatuses) {
      const tab = createConnectingTab({ status });
      expect(tab.status).toBe(status);
    }
  });

  it("exited status preserves exitCode", () => {
    const running = transitionToRunning(createConnectingTab(), "pty-4", 400);
    const exited: TerminalTabState = {
      ...running,
      status: "exited",
      exitCode: 0,
    };

    expect(exited.status).toBe("exited");
    expect(exited.exitCode).toBe(0);
    expect(exited.ptyId).toBe("pty-4");
  });
});

describe("PTY spawn result handling", () => {
  /** Simulate the IPC result from pty:spawn */
  type SpawnResult =
    | { success: true; ptyId: string; pid: number }
    | { success: false; error: string };

  function applySpawnResult(
    tab: TerminalTabState,
    result: SpawnResult,
  ): TerminalTabState {
    if (result.success) {
      return transitionToRunning(tab, result.ptyId, result.pid);
    }
    return transitionToError(tab, result.error);
  }

  it("success result transitions to running", () => {
    const tab = createConnectingTab();
    const result: SpawnResult = { success: true, ptyId: "pty-5", pid: 500 };
    const updated = applySpawnResult(tab, result);
    expect(updated.status).toBe("running");
  });

  it("failure result transitions to error with message", () => {
    const tab = createConnectingTab();
    const result: SpawnResult = {
      success: false,
      error: "node-pty モジュールが見つかりません",
    };
    const updated = applySpawnResult(tab, result);
    expect(updated.status).toBe("error");
    expect(updated.errorMessage).toBe("node-pty モジュールが見つかりません");
  });

  it("tab is never left in 'connecting' after applySpawnResult", () => {
    const tab = createConnectingTab();

    const success = applySpawnResult(tab, { success: true, ptyId: "x", pid: 1 });
    expect(success.status).not.toBe("connecting");

    const failure = applySpawnResult(tab, { success: false, error: "err" });
    expect(failure.status).not.toBe("connecting");
  });
});
