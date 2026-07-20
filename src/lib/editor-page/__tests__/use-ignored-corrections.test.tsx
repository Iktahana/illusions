/**
 * Regression tests for useIgnoredCorrections — the load/optimistic-update race.
 *
 * Bug: on a slow VFS (e.g. Google Drive), the initial async load of
 * ignored-corrections.json can resolve AFTER the user has optimistically
 * ignored a correction, clobbering the freshly-ignored entry back to the stale
 * on-disk snapshot. The item then vanishes from the editor and from the
 * "無視された指摘" list, even though it persisted to disk.
 *
 * Fix: a monotonic mutation-version guard discards any in-flight load result
 * once a local mutation (ignore / unignore / clear) has occurred.
 */

// Tell React this is a controlled test environment so act() flushes effects.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import type { IgnoredCorrection, EditorMode, ProjectMode } from "@/lib/project/project-types";

// ---------------------------------------------------------------------------
// Controllable mock service: loadIgnoredCorrections returns a deferred promise
// so the test can interleave an ignore() before the load resolves.
// ---------------------------------------------------------------------------

let resolveLoad: (data: IgnoredCorrection[]) => void;
let loadPromise: Promise<IgnoredCorrection[]>;
const addImpl = vi.fn<(r: string, t: string, c?: string) => Promise<IgnoredCorrection[]>>();

function resetService(): void {
  loadPromise = new Promise<IgnoredCorrection[]>((res) => {
    resolveLoad = res;
  });
}
resetService();

vi.mock("@/lib/services/ignored-corrections-service", () => ({
  getIgnoredCorrectionsService: () => ({
    loadIgnoredCorrections: () => loadPromise,
    loadIgnoredCorrectionsStandalone: () => loadPromise,
    addIgnoredCorrection: (r: string, t: string, c?: string) => addImpl(r, t, c),
    addIgnoredCorrectionStandalone: (_f: string, r: string, t: string, c?: string) =>
      addImpl(r, t, c),
    removeIgnoredCorrection: vi.fn(),
    clearIgnoredCorrections: vi.fn(),
    clearAllIgnoredCorrectionsStandalone: vi.fn(),
  }),
}));

import { useIgnoredCorrections } from "../use-ignored-corrections";

const PROJECT_MODE = {
  type: "project",
  projectId: "p1",
  name: "テスト",
} as unknown as ProjectMode;

// Harness that surfaces the hook's state + actions to the test. A mutable
// holder (not a reassigned binding) keeps the react-hooks lint rule happy.
const hookRef: { current: ReturnType<typeof useIgnoredCorrections> | null } = { current: null };
function Harness({ mode }: { mode: EditorMode }): null {
  // Test harness: deliberately publish the hook's value to an outer holder so
  // the test can drive it. Not a production render pattern.
  // eslint-disable-next-line react-hooks/immutability
  hookRef.current = useIgnoredCorrections(mode);
  return null;
}
function latest(): ReturnType<typeof useIgnoredCorrections> {
  if (!hookRef.current) throw new Error("hook not mounted");
  return hookRef.current;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetService();
  addImpl.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useIgnoredCorrections — load/optimistic race", () => {
  it("keeps an optimistic ignore even when the initial load resolves late with stale data", async () => {
    // addIgnoredCorrection resolves with the authoritative post-write list.
    addImpl.mockResolvedValue([{ ruleId: "rule-a", text: "時", addedAt: 1, context: undefined }]);

    act(() => {
      root.render(<Harness mode={PROJECT_MODE} />);
    });

    // The initial load is still in flight. User ignores a correction.
    act(() => {
      latest().ignoreCorrection("rule-a", "時");
    });
    expect(latest().ignoredCorrections).toHaveLength(1);

    // Now the slow initial load resolves with the STALE (empty) on-disk snapshot.
    await act(async () => {
      resolveLoad([]);
      await loadPromise;
    });

    // The stale load must NOT clobber the freshly-ignored entry.
    expect(latest().ignoredCorrections).toHaveLength(1);
    expect(latest().ignoredCorrections[0]).toMatchObject({ ruleId: "rule-a", text: "時" });
  });

  it("applies the initial load when no mutation raced it", async () => {
    act(() => {
      root.render(<Harness mode={PROJECT_MODE} />);
    });

    await act(async () => {
      resolveLoad([{ ruleId: "rule-b", text: "事", addedAt: 2, context: undefined }]);
      await loadPromise;
    });

    expect(latest().ignoredCorrections).toHaveLength(1);
    expect(latest().ignoredCorrections[0]).toMatchObject({ ruleId: "rule-b", text: "事" });
  });
});
