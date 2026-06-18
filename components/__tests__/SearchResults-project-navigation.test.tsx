(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

describe("SearchResults project navigation", () => {
  it("opens the exact file before jumping and navigates across files", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpenProjectFile = vi.fn(async () => {});
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

    for (let attempt = 0; attempt < 20 && !container.textContent?.includes("second.mdi"); attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    }

    expect(container.textContent).toContain("first.mdi");
    expect(container.textContent).toContain("second.mdi");

    await act(async () => {
      (container.querySelector('[aria-label="次の一致"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(onOpenProjectFile).toHaveBeenCalledWith("second.mdi");
    expect(onCurrentMatchIndexChange).toHaveBeenCalledWith(0);
    expect(onOpenProjectFile.mock.invocationCallOrder[0]).toBeLessThan(
      onCurrentMatchIndexChange.mock.invocationCallOrder[0],
    );

    act(() => root.unmount());
  });

  it("shows a file error while retaining successful results", async () => {
    projectVfs.readFile.mockRejectedValueOnce(new Error("permission denied"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SearchResults
          editorView={null}
          searchTerm="target"
          onSearchTermChange={() => {}}
          caseSensitive={false}
          onCaseSensitiveChange={() => {}}
          matches={[]}
          currentMatchIndex={0}
          onCurrentMatchIndexChange={() => {}}
          onClose={() => {}}
          projectSearchEnabled
          onOpenProjectFile={async () => {}}
          onProjectBufferChange={() => {}}
        />,
      );
    });

    for (let attempt = 0; attempt < 20 && !container.textContent?.includes("second.mdi"); attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    }

    expect(container.textContent).toContain("second.mdi");
    expect(container.textContent).toContain("first.mdi: permission denied");
    act(() => root.unmount());
  });
});
