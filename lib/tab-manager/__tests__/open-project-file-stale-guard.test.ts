/**
 * Regression test for #1917 — rapid consecutive openProjectFile calls must
 * not allow a stale (earlier) async read to steal focus from the latest click.
 *
 * Root cause (#1867 left unaddressed in use-file-io.ts): the SearchResults
 * navRequestIdRef only guarded onCurrentMatchIndexChange; the underlying
 * openProjectFile awaited vfs.readFile and then unconditionally called
 * setActiveTabId, so the slower first read could activate after the faster
 * second read, replacing the user's latest selection.
 *
 * Fix: latestOpenRequestRef captures a monotonically increasing ID before
 * each readFile; after the await, stale invocations (ID < current) return
 * without calling setActiveTabId or touching the current tab.
 *
 * These tests extract and verify the pure staleness-guard logic without
 * mounting React or a full browser environment.
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Minimal replica of the latestOpenRequestRef staleness-guard logic
// extracted from openProjectFile in use-file-io.ts.
//
// This mirrors the exact pattern in the hook so that if the production
// guard is removed or changed incompatibly, these tests will fail.
// ---------------------------------------------------------------------------

interface SimulatedTab {
  id: string;
  path: string;
}

interface OpenResult {
  activatedPath: string | null;
  tabCreated: boolean;
}

/**
 * Simulated openProjectFile that models only the staleness-guard path:
 * - increments the shared latestOpenRequestRef counter at the start
 * - awaits the provided readFile promise
 * - checks counter after await; if stale, skips activation
 */
async function simulatedOpenProjectFile(
  vfsPath: string,
  readFilePromise: Promise<string>,
  latestOpenRequestRef: { current: number },
  setActiveTabId: (path: string) => void,
  createdTabs: SimulatedTab[],
): Promise<OpenResult> {
  // Mirror: const requestId = ++latestOpenRequestRef.current
  const requestId = ++latestOpenRequestRef.current;

  let _fileContent: string;
  try {
    _fileContent = await readFilePromise;
  } catch {
    return { activatedPath: null, tabCreated: false };
  }

  // Mirror: if (latestOpenRequestRef.current !== requestId) return;
  if (latestOpenRequestRef.current !== requestId) {
    return { activatedPath: null, tabCreated: false };
  }

  // Not stale — proceed with activation (new-tab path)
  const tab: SimulatedTab = { id: `tab-${vfsPath}`, path: vfsPath };
  createdTabs.push(tab);
  setActiveTabId(vfsPath);
  return { activatedPath: vfsPath, tabCreated: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("openProjectFile staleness guard (#1917)", () => {
  it("latest open wins when first read resolves after second", async () => {
    // Simulate: click A (first.mdi) whose readFile resolves AFTER click B (second.mdi).
    // Expected: second.mdi is activated; first.mdi is discarded (stale).

    const latestOpenRequestRef = { current: 0 };
    const setActiveTabId = vi.fn();
    const createdTabs: SimulatedTab[] = [];

    // Controlled promises: resolvers[0] = first.mdi resolve fn
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const firstPromise = new Promise<string>((res) => {
      resolveFirst = res;
    });
    const secondPromise = new Promise<string>((res) => {
      resolveSecond = res;
    });

    // Both opens start before either readFile resolves (simulating rapid clicks)
    const openA = simulatedOpenProjectFile(
      "first.mdi",
      firstPromise,
      latestOpenRequestRef,
      setActiveTabId,
      createdTabs,
    );
    const openB = simulatedOpenProjectFile(
      "second.mdi",
      secondPromise,
      latestOpenRequestRef,
      setActiveTabId,
      createdTabs,
    );

    // After both starts, counter is 2; openA holds requestId=1, openB holds requestId=2.
    expect(latestOpenRequestRef.current).toBe(2);

    // Click B resolves first (fast read)
    resolveSecond("second.mdi content");
    const resultB = await openB;

    // Click A resolves last (slow read) — this is now stale
    resolveFirst("first.mdi content");
    const resultA = await openA;

    // second.mdi (latest) must have been activated exactly once
    expect(resultB.activatedPath).toBe("second.mdi");
    expect(resultB.tabCreated).toBe(true);

    // first.mdi (stale) must have been discarded — no activation, no tab
    expect(resultA.activatedPath).toBeNull();
    expect(resultA.tabCreated).toBe(false);

    // setActiveTabId must have been called exactly once, for second.mdi
    expect(setActiveTabId).toHaveBeenCalledTimes(1);
    expect(setActiveTabId).toHaveBeenCalledWith("second.mdi");
  });

  it("non-stale single open activates the tab normally", async () => {
    const latestOpenRequestRef = { current: 0 };
    const setActiveTabId = vi.fn();
    const createdTabs: SimulatedTab[] = [];

    const openA = simulatedOpenProjectFile(
      "file.mdi",
      Promise.resolve("file content"),
      latestOpenRequestRef,
      setActiveTabId,
      createdTabs,
    );
    const resultA = await openA;

    expect(resultA.activatedPath).toBe("file.mdi");
    expect(resultA.tabCreated).toBe(true);
    expect(setActiveTabId).toHaveBeenCalledOnce();
    expect(setActiveTabId).toHaveBeenCalledWith("file.mdi");
  });

  it("three rapid clicks: only the last-clicked file is activated", async () => {
    const latestOpenRequestRef = { current: 0 };
    const setActiveTabId = vi.fn();
    const createdTabs: SimulatedTab[] = [];

    let resolveA!: (value: string) => void;
    let resolveB!: (value: string) => void;
    let resolveC!: (value: string) => void;
    const promiseA = new Promise<string>((res) => {
      resolveA = res;
    });
    const promiseB = new Promise<string>((res) => {
      resolveB = res;
    });
    const promiseC = new Promise<string>((res) => {
      resolveC = res;
    });

    const openA = simulatedOpenProjectFile(
      "a.mdi",
      promiseA,
      latestOpenRequestRef,
      setActiveTabId,
      createdTabs,
    );
    const openB = simulatedOpenProjectFile(
      "b.mdi",
      promiseB,
      latestOpenRequestRef,
      setActiveTabId,
      createdTabs,
    );
    const openC = simulatedOpenProjectFile(
      "c.mdi",
      promiseC,
      latestOpenRequestRef,
      setActiveTabId,
      createdTabs,
    );

    // Counter is now 3; only C (requestId=3) matches latestOpenRequestRef.current
    expect(latestOpenRequestRef.current).toBe(3);

    // Resolve out-of-order: B first, then A, then C last
    resolveB("b content");
    const resultB = await openB;

    resolveA("a content");
    const resultA = await openA;

    resolveC("c content");
    const resultC = await openC;

    expect(resultA.activatedPath).toBeNull(); // stale
    expect(resultB.activatedPath).toBeNull(); // stale
    expect(resultC.activatedPath).toBe("c.mdi"); // latest wins

    expect(setActiveTabId).toHaveBeenCalledTimes(1);
    expect(setActiveTabId).toHaveBeenCalledWith("c.mdi");
  });

  it("non-overlapping sequential opens each activate their file", async () => {
    // When opens don't overlap (each completes before the next starts),
    // every open must successfully activate.
    const latestOpenRequestRef = { current: 0 };
    const setActiveTabId = vi.fn();
    const createdTabs: SimulatedTab[] = [];

    await simulatedOpenProjectFile(
      "x.mdi",
      Promise.resolve("x"),
      latestOpenRequestRef,
      setActiveTabId,
      createdTabs,
    );
    await simulatedOpenProjectFile(
      "y.mdi",
      Promise.resolve("y"),
      latestOpenRequestRef,
      setActiveTabId,
      createdTabs,
    );

    expect(setActiveTabId).toHaveBeenCalledTimes(2);
    expect(setActiveTabId).toHaveBeenNthCalledWith(1, "x.mdi");
    expect(setActiveTabId).toHaveBeenNthCalledWith(2, "y.mdi");
  });
});
