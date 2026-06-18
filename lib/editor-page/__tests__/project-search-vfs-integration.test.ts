import { afterEach, describe, expect, it, vi } from "vitest";

import { searchProjectFiles } from "@/lib/editor-page/project-search";
import { ElectronVFS } from "@/lib/vfs/electron-vfs";
import { WebVFS } from "@/lib/vfs/web-vfs";

interface FakeNativeEntry {
  name: string;
  kind: "file" | "directory";
}

function fileHandle(name: string, content: string): FileSystemFileHandle {
  return {
    name,
    kind: "file",
    getFile: async () => new File([content], name),
  } as unknown as FileSystemFileHandle;
}

function directoryHandle(
  name: string,
  entries: ReadonlyMap<string, FileSystemHandle>,
  getDirectoryHandle = vi.fn(async (entryName: string) => {
    const entry = entries.get(entryName);
    if (!entry || entry.kind !== "directory") throw new DOMException("not found", "NotFoundError");
    return entry as FileSystemDirectoryHandle;
  }),
): FileSystemDirectoryHandle {
  return {
    name,
    kind: "directory",
    getDirectoryHandle,
    getFileHandle: async (entryName: string) => {
      const entry = entries.get(entryName);
      if (!entry || entry.kind !== "file") throw new DOMException("not found", "NotFoundError");
      return entry as FileSystemFileHandle;
    },
    async *[Symbol.asyncIterator]() {
      for (const item of entries) yield item;
    },
  } as unknown as FileSystemDirectoryHandle;
}

const originalElectronApi = window.electronAPI;

afterEach(() => {
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    writable: true,
    value: originalElectronApi,
  });
});

describe("project search VFS integration", () => {
  it("uses WebVFS without entering dot-prefixed directories", async () => {
    const hiddenDirectory = directoryHandle(".illusions", new Map());
    const hiddenLookup = vi.fn(async () => hiddenDirectory);
    const root = directoryHandle(
      "project",
      new Map<string, FileSystemHandle>([
        [".illusions", hiddenDirectory],
        [".draft.mdi", fileHandle(".draft.mdi", "target")],
        ["chapter.mdi", fileHandle("chapter.mdi", "target")],
      ]),
      hiddenLookup,
    );
    const vfs = new WebVFS();
    vfs.setRootHandle(root);

    const results = await searchProjectFiles({ vfs, searchTerm: "target", options: {} });

    expect(results.map((result) => result.path)).toEqual(["/chapter.mdi"]);
    expect(hiddenLookup).not.toHaveBeenCalled();
  });

  it("uses ElectronVFS without issuing IPC reads for dot-prefixed paths", async () => {
    const readFile = vi.fn(async () => "target");
    const readDirectory = vi.fn(async (path: string): Promise<FakeNativeEntry[]> => {
      if (path === "/project") {
        return [
          { name: ".illusions", kind: "directory" },
          { name: ".draft.mdi", kind: "file" },
          { name: "chapter.mdi", kind: "file" },
        ];
      }
      throw new Error(`Unexpected directory read: ${path}`);
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      writable: true,
      value: { vfs: { readDirectory, readFile } },
    });
    const vfs = new ElectronVFS();
    await vfs.setRootPath("/project");

    const results = await searchProjectFiles({ vfs, searchTerm: "target", options: {} });

    expect(results.map((result) => result.path)).toEqual(["chapter.mdi"]);
    expect(readDirectory).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith("/project/chapter.mdi");
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});
