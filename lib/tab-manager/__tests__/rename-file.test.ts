/**
 * Unit tests for the inspector / tab file-rename transaction (#1870).
 *
 * The inspector's editable file name must perform a *real* VFS rename, detect
 * name collisions before overwriting, and surface enough information for the
 * caller to keep the open tab's path/name in sync. These tests pin that
 * contract so the entry point in app/page.tsx can rely on it.
 */

import { describe, it, expect, vi } from "vitest";
import type { VFSEntry } from "@/lib/vfs/types";
import {
  joinVfsPath,
  nameExistsInDir,
  parentVfsDir,
  renameProjectFile,
  type RenameVfs,
} from "../rename-file";

function entry(name: string, kind: "file" | "directory" = "file"): VFSEntry {
  return { name, kind, path: name };
}

function makeVfs(entries: VFSEntry[]): {
  vfs: RenameVfs;
  rename: ReturnType<typeof vi.fn>;
  listDirectory: ReturnType<typeof vi.fn>;
} {
  const rename = vi.fn().mockResolvedValue(undefined);
  const listDirectory = vi.fn().mockResolvedValue(entries);
  return { vfs: { rename, listDirectory }, rename, listDirectory };
}

describe("path helpers", () => {
  it("parentVfsDir returns '' for a root-level file", () => {
    expect(parentVfsDir("formatting.mdi")).toBe("");
  });

  it("parentVfsDir returns the directory for a nested file", () => {
    expect(parentVfsDir("chapters/01.mdi")).toBe("chapters");
    expect(parentVfsDir("a/b/c.mdi")).toBe("a/b");
  });

  it("joinVfsPath joins root-level and nested paths", () => {
    expect(joinVfsPath("", "x.mdi")).toBe("x.mdi");
    expect(joinVfsPath("chapters", "01.mdi")).toBe("chapters/01.mdi");
  });
});

describe("nameExistsInDir", () => {
  it("queries the parent directory and matches by exact name", async () => {
    const { vfs, listDirectory } = makeVfs([entry("a.mdi"), entry("b.mdi")]);
    await expect(nameExistsInDir(vfs, "chapters", "b.mdi")).resolves.toBe(true);
    expect(listDirectory).toHaveBeenCalledWith("chapters");
  });

  it("is case-sensitive", async () => {
    const { vfs } = makeVfs([entry("Novel.mdi")]);
    await expect(nameExistsInDir(vfs, "", "novel.mdi")).resolves.toBe(false);
  });

  it("returns false (does not throw) when listing fails", async () => {
    const vfs: RenameVfs = {
      rename: vi.fn(),
      listDirectory: vi.fn().mockRejectedValue(new Error("nope")),
    };
    await expect(nameExistsInDir(vfs, "", "x.mdi")).resolves.toBe(false);
  });
});

describe("renameProjectFile", () => {
  it("performs a real VFS rename to the new path in the same directory", async () => {
    const { vfs, rename } = makeVfs([entry("formatting.mdi")]);
    const outcome = await renameProjectFile(vfs, {
      currentPath: "chapters/formatting.mdi",
      newName: "formatting-ui-rename.mdi",
    });

    expect(rename).toHaveBeenCalledWith(
      "chapters/formatting.mdi",
      "chapters/formatting-ui-rename.mdi",
    );
    expect(outcome).toEqual({
      kind: "renamed",
      oldPath: "chapters/formatting.mdi",
      newPath: "chapters/formatting-ui-rename.mdi",
      newName: "formatting-ui-rename.mdi",
    });
  });

  it("renames root-level files without a leading slash", async () => {
    const { vfs, rename } = makeVfs([entry("formatting.mdi")]);
    const outcome = await renameProjectFile(vfs, {
      currentPath: "formatting.mdi",
      newName: "renamed.mdi",
    });
    expect(rename).toHaveBeenCalledWith("formatting.mdi", "renamed.mdi");
    expect(outcome.kind).toBe("renamed");
  });

  it("returns noop and does not rename when the name is unchanged", async () => {
    const { vfs, rename } = makeVfs([entry("formatting.mdi")]);
    const outcome = await renameProjectFile(vfs, {
      currentPath: "chapters/formatting.mdi",
      newName: "formatting.mdi",
    });
    expect(outcome).toEqual({ kind: "noop" });
    expect(rename).not.toHaveBeenCalled();
  });

  it("returns noop for an empty / whitespace-only name", async () => {
    const { vfs, rename } = makeVfs([]);
    await expect(renameProjectFile(vfs, { currentPath: "a.mdi", newName: "   " })).resolves.toEqual(
      { kind: "noop" },
    );
    expect(rename).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace from the new name", async () => {
    const { vfs, rename } = makeVfs([]);
    const outcome = await renameProjectFile(vfs, {
      currentPath: "a.mdi",
      newName: "  b.mdi  ",
    });
    expect(rename).toHaveBeenCalledWith("a.mdi", "b.mdi");
    expect(outcome.kind).toBe("renamed");
  });

  it("detects a collision and does NOT call rename (no overwrite without confirm)", async () => {
    const { vfs, rename } = makeVfs([entry("taken.mdi"), entry("source.mdi")]);
    const outcome = await renameProjectFile(vfs, {
      currentPath: "source.mdi",
      newName: "taken.mdi",
    });
    expect(outcome).toEqual({
      kind: "collision",
      name: "taken.mdi",
      newPath: "taken.mdi",
    });
    expect(rename).not.toHaveBeenCalled();
  });

  it("forces the rename (overwrite) when force=true, skipping the collision check", async () => {
    const { vfs, rename, listDirectory } = makeVfs([entry("taken.mdi"), entry("source.mdi")]);
    const outcome = await renameProjectFile(
      vfs,
      { currentPath: "source.mdi", newName: "taken.mdi" },
      true,
    );
    expect(listDirectory).not.toHaveBeenCalled();
    expect(rename).toHaveBeenCalledWith("source.mdi", "taken.mdi");
    expect(outcome.kind).toBe("renamed");
  });

  it("returns an error outcome when the VFS rename throws (display must stay unchanged)", async () => {
    const failure = new Error("disk full");
    const vfs: RenameVfs = {
      listDirectory: vi.fn().mockResolvedValue([]),
      rename: vi.fn().mockRejectedValue(failure),
    };
    const outcome = await renameProjectFile(vfs, {
      currentPath: "a.mdi",
      newName: "b.mdi",
    });
    expect(outcome).toEqual({ kind: "error", error: failure });
  });
});
