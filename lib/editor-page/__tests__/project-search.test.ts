import { describe, expect, it, vi } from "vitest";

import {
  findRawDocumentMatches,
  isSearchableProjectPath,
  replaceProjectFiles,
  undoProjectReplacement,
  searchProjectFiles,
} from "@/lib/editor-page/project-search";
import type { VirtualFileSystem, VFSEntry } from "@/lib/vfs/types";

function entry(path: string, kind: VFSEntry["kind"]): VFSEntry {
  return { name: path.split("/").at(-1) ?? path, path, kind };
}

describe("project search path filtering", () => {
  it("returns no results for an empty project", async () => {
    const vfs = {
      listDirectory: vi.fn(async () => []),
    } as unknown as VirtualFileSystem;

    await expect(searchProjectFiles({ vfs, searchTerm: "target", options: {} })).resolves.toEqual(
      [],
    );
  });

  it("excludes every dot-prefixed path segment and unsupported file", () => {
    expect(isSearchableProjectPath("chapter/one.mdi")).toBe(true);
    expect(isSearchableProjectPath(".illusions/history/one.mdi")).toBe(false);
    expect(isSearchableProjectPath("chapter/.vscode/settings.mdi")).toBe(false);
    expect(isSearchableProjectPath("chapter/.draft.mdi")).toBe(false);
    expect(isSearchableProjectPath("chapter/cover.png")).toBe(false);
  });

  it("never descends into hidden directories or reads hidden files", async () => {
    const directories: Record<string, VFSEntry[]> = {
      "": [
        entry(".illusions", "directory"),
        entry(".vscode", "directory"),
        entry("chapters", "directory"),
        entry(".secret.mdi", "file"),
        entry("root.mdi", "file"),
      ],
      chapters: [entry("chapters/one.mdi", "file"), entry("chapters/notes.json", "file")],
    };
    const listDirectory = vi.fn(async (path: string) => directories[path] ?? []);
    const readFile = vi.fn(async (path: string) => `target in ${path}`);
    const vfs = { listDirectory, readFile } as unknown as VirtualFileSystem;

    const results = await searchProjectFiles({ vfs, searchTerm: "target", options: {} });

    expect(results.map((result) => result.path)).toEqual(["chapters/one.mdi", "root.mdi"]);
    expect(listDirectory).toHaveBeenCalledTimes(2);
    expect(listDirectory).not.toHaveBeenCalledWith(".illusions");
    expect(listDirectory).not.toHaveBeenCalledWith(".vscode");
    expect(readFile).not.toHaveBeenCalledWith(".secret.mdi");
  });

  it("does not list a hidden directory selected as the search root", async () => {
    const listDirectory = vi.fn(async () => [entry(".illusions/history.mdi", "file")]);
    const vfs = { listDirectory } as unknown as VirtualFileSystem;

    const results = await searchProjectFiles({
      vfs,
      searchTerm: "target",
      options: {},
      rootPath: ".illusions",
    });

    expect(results).toEqual([]);
    expect(listDirectory).not.toHaveBeenCalled();
  });

  it("stops before reading files when the search is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const readFile = vi.fn(async () => "target");
    const vfs = {
      listDirectory: vi.fn(async () => [entry("chapter.mdi", "file")]),
      readFile,
    } as unknown as VirtualFileSystem;

    await expect(
      searchProjectFiles({
        vfs,
        searchTerm: "target",
        options: {},
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(readFile).not.toHaveBeenCalled();
  });
});

describe("raw project document matching", () => {
  it("searches displayed MDI text without exposing macro names or metadata", () => {
    const content = [
      "前{東京|とう.きょう}後",
      "[[kern:0.5em:本文]]",
      "[[no-break:禁則]]",
      "[[blank]]",
    ].join("\n");

    expect(findRawDocumentMatches(content, ".mdi", "東京", {}).matches).toMatchObject([
      { text: "東京", source: "ruby-base", replaceable: false },
    ]);
    expect(findRawDocumentMatches(content, ".mdi", "とうきょう", {}).matches).toMatchObject([
      { text: "とうきょう", source: "ruby-text", replaceable: false },
    ]);
    expect(findRawDocumentMatches(content, ".mdi", "本文", {}).matches).toMatchObject([
      { text: "本文", source: "kern", replaceable: false },
    ]);
    expect(findRawDocumentMatches(content, ".mdi", "0.5em", {}).matches).toEqual([]);
    expect(findRawDocumentMatches(content, ".mdi", "blank", {}).matches).toEqual([]);
  });

  it("returns raw offsets only for plain-text replacements and preserves macros", () => {
    const content = "対象{対象|たいしょう}対象";
    const result = findRawDocumentMatches(content, ".mdi", "対象", {});

    expect(result.matches).toMatchObject([
      { rawFrom: 0, rawTo: 2, replaceable: true },
      { source: "ruby-base", replaceable: false },
      { rawFrom: 12, rawTo: 14, replaceable: true },
    ]);
  });

  it("uses an unsaved buffer instead of stale VFS content", async () => {
    const vfs = {
      listDirectory: vi.fn(async () => [entry("chapter.mdi", "file")]),
      readFile: vi.fn(async () => "old text"),
    } as unknown as VirtualFileSystem;

    const results = await searchProjectFiles({
      vfs,
      searchTerm: "new text",
      options: {},
      openBuffers: new Map([["chapter.mdi", "new text"]]),
    });

    expect(results).toHaveLength(1);
    expect(results[0].matches).toHaveLength(1);
    expect(vfs.readFile).not.toHaveBeenCalled();
  });

  it("excludes HTML comments by default and can include them as non-replaceable results", () => {
    const content = "target <!-- target -->";

    expect(findRawDocumentMatches(content, ".mdi", "target", {}).matches).toHaveLength(1);
    expect(
      findRawDocumentMatches(content, ".mdi", "target", { excludeComments: false }).matches,
    ).toMatchObject([
      { source: "text", replaceable: true },
      { source: "comment", replaceable: false },
    ]);
  });

  it("applies comment filtering to Markdown files", () => {
    const content = "target <!-- target -->";

    expect(findRawDocumentMatches(content, ".md", "target", {}).matches).toHaveLength(1);
    expect(
      findRawDocumentMatches(content, ".md", "target", { excludeComments: false }).matches,
    ).toMatchObject([
      { source: "text", replaceable: true },
      { source: "comment", replaceable: false },
    ]);
  });

  it("reports file results incrementally across a large project", async () => {
    const files = Array.from({ length: 64 }, (_, index) => entry(`chapter-${index}.mdi`, "file"));
    const vfs = {
      listDirectory: vi.fn(async () => files),
      readFile: vi.fn(async (path: string) => `target ${path}`),
    } as unknown as VirtualFileSystem;
    const onFileResult = vi.fn();
    const onProgress = vi.fn();

    const results = await searchProjectFiles({
      vfs,
      searchTerm: "target",
      options: {},
      onFileResult,
      onProgress,
    });

    expect(results).toHaveLength(64);
    expect(onFileResult).toHaveBeenCalledTimes(64);
    expect(onProgress).toHaveBeenLastCalledWith(64, 64);
  });

  it("delegates huge-file matching to the supplied asynchronous matcher", async () => {
    const content = `${"x".repeat(2_000_000)}target`;
    const vfs = {
      listDirectory: vi.fn(async () => [entry("huge.mdi", "file")]),
      readFile: vi.fn(async () => content),
    } as unknown as VirtualFileSystem;
    const matchDocument = vi.fn(async (...args: Parameters<typeof findRawDocumentMatches>) =>
      findRawDocumentMatches(...args),
    );

    const results = await searchProjectFiles({
      vfs,
      searchTerm: "target",
      options: {},
      matchDocument,
    });

    expect(matchDocument).toHaveBeenCalledTimes(1);
    expect(results[0].matches[0].rawFrom).toBe(2_000_000);
  });
});

describe("project-wide replacement", () => {
  it("replaces only plain text and preserves MDI atoms", async () => {
    const content = "対象{対象|たいしょう}対象";
    const searched = findRawDocumentMatches(content, ".mdi", "対象", {});
    const writeFile = vi.fn(async () => {});
    const vfs = { readFile: vi.fn(async () => content), writeFile } as unknown as VirtualFileSystem;

    const changes = await replaceProjectFiles({
      vfs,
      results: [{ ...searched, path: "chapter.mdi", fileName: "chapter.mdi" }],
      replacement: "変更",
      options: {},
    });

    expect(writeFile).toHaveBeenCalledWith("chapter.mdi", "変更{対象|たいしょう}変更");
    expect(changes).toMatchObject([{ path: "chapter.mdi", replacementCount: 2 }]);
  });

  it.each([
    ["a a", "longer", "longer longer"],
    ["target target", "x", "x x"],
  ])("handles replacement length changes without offset drift", async (content, replacement, expected) => {
    const searchTerm = content.startsWith("a") ? "a" : "target";
    const searched = findRawDocumentMatches(content, ".mdi", searchTerm, {});
    const writeFile = vi.fn(async () => {});
    const vfs = { readFile: vi.fn(async () => content), writeFile } as unknown as VirtualFileSystem;

    await replaceProjectFiles({
      vfs,
      results: [{ ...searched, path: "chapter.mdi", fileName: "chapter.mdi" }],
      replacement,
      options: {},
    });

    expect(writeFile).toHaveBeenCalledWith("chapter.mdi", expected);
  });

  it("updates open buffers without writing them to disk", async () => {
    const open = findRawDocumentMatches("target", ".mdi", "target", {});
    const closed = findRawDocumentMatches("target", ".mdi", "target", {});
    const writeFile = vi.fn(async () => {});
    const onOpenBufferChange = vi.fn(async () => {});
    const vfs = {
      readFile: vi.fn(async () => "target"),
      writeFile,
    } as unknown as VirtualFileSystem;

    const changes = await replaceProjectFiles({
      vfs,
      results: [
        { ...open, path: "open.mdi", fileName: "open.mdi" },
        { ...closed, path: "closed.mdi", fileName: "closed.mdi" },
      ],
      replacement: "changed",
      options: {},
      openBuffers: new Map([["open.mdi", "target"]]),
      onOpenBufferChange,
    });

    expect(onOpenBufferChange).toHaveBeenCalledWith("open.mdi", "changed");
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith("closed.mdi", "changed");
    expect(changes).toHaveLength(2);
  });

  it("aborts before writing when a file changed after the search", async () => {
    const searched = findRawDocumentMatches("target", ".mdi", "target", {});
    const writeFile = vi.fn(async () => {});
    const vfs = {
      readFile: vi.fn(async () => "newer content"),
      writeFile,
    } as unknown as VirtualFileSystem;

    await expect(
      replaceProjectFiles({
        vfs,
        results: [{ ...searched, path: "chapter.mdi", fileName: "chapter.mdi" }],
        replacement: "changed",
        options: {},
      }),
    ).rejects.toThrow("検索後に内容が変更されました");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("restores both VFS files and open buffers from the operation log", async () => {
    const writeFile = vi.fn(async () => {});
    const onOpenBufferChange = vi.fn(async () => {});
    const vfs = {
      readFile: vi.fn(async () => "after-closed"),
      writeFile,
    } as unknown as VirtualFileSystem;
    const changes = [
      {
        path: "open.mdi",
        before: "before-open",
        after: "after-open",
        replacementCount: 1,
        openBuffer: true,
      },
      {
        path: "closed.mdi",
        before: "before-closed",
        after: "after-closed",
        replacementCount: 1,
        openBuffer: false,
      },
    ];

    await undoProjectReplacement({
      vfs,
      changes,
      openBuffers: new Map([["open.mdi", "after-open"]]),
      onOpenBufferChange,
    });

    expect(onOpenBufferChange).toHaveBeenCalledWith("open.mdi", "before-open");
    expect(writeFile).toHaveBeenCalledWith("closed.mdi", "before-closed");
  });

  it("does not undo over content edited after replacement", async () => {
    const writeFile = vi.fn(async () => {});
    const vfs = {
      readFile: vi.fn(async () => "edited-again"),
      writeFile,
    } as unknown as VirtualFileSystem;

    await expect(
      undoProjectReplacement({
        vfs,
        changes: [
          {
            path: "chapter.mdi",
            before: "before",
            after: "after",
            replacementCount: 1,
            openBuffer: false,
          },
        ],
      }),
    ).rejects.toThrow("置換後に内容が変更されました");
    expect(writeFile).not.toHaveBeenCalled();
  });
});
