(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test for #1867:
 * Rapid consecutive clicks on project search results must not allow a stale
 * (earlier) open resolution to overwrite the latest match-index selection.
 *
 * The fix adds a monotonically increasing navRequestIdRef counter; only the
 * resolution whose reqId matches the latest counter value calls
 * onCurrentMatchIndexChange.
 */

import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const projectVfs = vi.hoisted(() => ({
  isRootOpen: vi.fn(() => true),
  listDirectory: vi.fn(async () => [
    { name: "first.mdi", path: "first.mdi", kind: "file" as const },
    { name: "second.mdi", path: "second.mdi", kind: "file" as const },
  ]),
  readFile: vi.fn(async (path: string) => `${path} target`),
}));

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => projectVfs,
}));

vi.mock("@/lib/editor-page/project-search-worker-client", () => ({
  ProjectSearchWorkerClient: class {
    matchDocument = async (content: string, _fileType: string, searchTerm: string) => {
      const from = content.indexOf(searchTerm);
      return {
        content,
        matches:
          from < 0
            ? []
            : [
                {
                  from,
                  to: from + searchTerm.length,
                  rawFrom: from,
                  rawTo: from + searchTerm.length,
                  lineNumber: 1,
                  text: searchTerm,
                },
              ],
      };
    };
    dispose(): void {}
  },
}));

import SearchResults from "../SearchResults";

beforeEach(() => {
  projectVfs.isRootOpen.mockReturnValue(true);
  projectVfs.listDirectory.mockResolvedValue([
    { name: "first.mdi", path: "first.mdi", kind: "file" as const },
    { name: "second.mdi", path: "second.mdi", kind: "file" as const },
  ]);
  projectVfs.readFile.mockImplementation(async (path: string) => `${path} target`);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("SearchResults stale navigation guard (#1867)", () => {
  it("ignores stale open resolution when a later click supersedes it", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    /**
     * Simulate the race: two rapid clicks on different results.
     * - Click A (index 0, file "first.mdi") starts an open that resolves LAST.
     * - Click B (index 0, file "second.mdi") starts an open that resolves FIRST.
     *
     * Without the guard, Click A's .then() fires after Click B's and overwrites
     * the match index selection, applying matchIndex=0 for first.mdi after
     * the user already selected second.mdi.
     *
     * With the guard, Click A's resolution is discarded because navRequestIdRef
     * was incremented by Click B before A's promise settled.
     */

    // resolvers[0] = Click A's open resolve fn; resolvers[1] = Click B's
    const resolvers: Array<() => void> = [];

    const onOpenProjectFile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const onCurrentMatchIndexChange = vi.fn();

    await act(async () => {
      root.render(
        <SearchResults
          editorView={null}
          searchTerm="target"
          onSearchTermChange={() => {}}
          caseSensitive={false}
          onCaseSensitiveChange={() => {}}
          matches={[]}
          currentMatchIndex={0}
          onCurrentMatchIndexChange={onCurrentMatchIndexChange}
          onClose={() => {}}
          projectSearchEnabled
          onOpenProjectFile={onOpenProjectFile}
          onProjectBufferChange={() => {}}
        />,
      );
    });

    // Wait for project search results to appear
    for (
      let attempt = 0;
      attempt < 20 && !container.textContent?.includes("second.mdi");
      attempt += 1
    ) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    }

    expect(container.textContent).toContain("first.mdi");
    expect(container.textContent).toContain("second.mdi");

    // Find the two result buttons (one per file)
    const resultButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button.w-full.text-left"),
    );
    expect(resultButtons.length).toBeGreaterThanOrEqual(2);

    // Click A: first result (first.mdi, matchIndex 0) — open will resolve LAST
    await act(async () => {
      resultButtons[0].click();
    });
    // Click B: second result (second.mdi, matchIndex 0) — open will resolve FIRST
    await act(async () => {
      resultButtons[1].click();
    });

    // At this point two opens are in-flight.
    expect(resolvers).toHaveLength(2);

    // Click B's open resolves first — this is the latest navigation request
    await act(async () => {
      resolvers[1]();
      await Promise.resolve();
    });

    // Click A's open resolves last — this is stale and must be ignored
    await act(async () => {
      resolvers[0]();
      await Promise.resolve();
    });

    // onCurrentMatchIndexChange must be called exactly once (from Click B only)
    expect(onCurrentMatchIndexChange).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });
});
