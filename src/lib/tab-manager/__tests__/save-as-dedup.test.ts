/**
 * Tests for Save-As destination de-duplication (#1872, DATA LOSS).
 *
 * Regression target: "名前を付けて保存" to a path that is ALREADY open in
 * another tab used to leave two editor tabs holding the same file.path (or the
 * same web file handle). Each tab kept an independent buffer and could silently
 * overwrite the other; path-keyed watcher suppression hid the other's write.
 *
 * These tests exercise the pure decision layer (save-as-dedup.ts) that the
 * saveAsFile consolidation step consumes. They prove the duplicate is detected
 * across Electron paths and web handles (isSameEntry), and that no duplicate is
 * reported for legitimate non-colliding saves.
 */

import { describe, it, expect, vi } from "vitest";

import type { EditorTabState, TabState } from "@/lib/tab-manager/tab-types";
import { createNewTab, generateTabId } from "@/lib/tab-manager/types";
import {
  findDuplicatePathTab,
  findDuplicateByHandle,
  resolveSaveAsDuplicate,
  saveAsDuplicateWarning,
} from "@/lib/tab-manager/save-as-dedup";
import type { MdiFileDescriptor } from "@/lib/project/mdi-file";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditorTab(overrides?: Partial<EditorTabState>): EditorTabState {
  return {
    ...createNewTab(),
    id: generateTabId(),
    ...overrides,
  };
}

function pathDescriptor(path: string, name = path.split("/").pop() ?? path): MdiFileDescriptor {
  return { path, handle: null, name };
}

/** Minimal FileSystemFileHandle stub with a controllable isSameEntry. */
function makeHandle(name: string, sameAs: FileSystemFileHandle[] = []): FileSystemFileHandle {
  const handle = {
    name,
    kind: "file" as const,
    isSameEntry: vi.fn(async (other: FileSystemFileHandle) => sameAs.includes(other)),
  };
  return handle as unknown as FileSystemFileHandle;
}

// ---------------------------------------------------------------------------
// findDuplicatePathTab — Electron / VFS path collisions
// ---------------------------------------------------------------------------

describe("findDuplicatePathTab (#1872)", () => {
  it("detects another tab already holding the Save-As destination path", () => {
    const source = makeEditorTab({ file: pathDescriptor("/p/A.mdi") });
    const existing = makeEditorTab({ file: pathDescriptor("/p/B.mdi") });
    const tabs: TabState[] = [source, existing];

    // Source tab was just saved to B.mdi (its descriptor now points at B.mdi).
    const dup = findDuplicatePathTab(tabs, "/p/B.mdi", source.id);

    expect(dup?.id).toBe(existing.id);
  });

  it("never flags the source tab itself as a duplicate", () => {
    const source = makeEditorTab({ file: pathDescriptor("/p/B.mdi") });
    const tabs: TabState[] = [source];

    const dup = findDuplicatePathTab(tabs, "/p/B.mdi", source.id);

    expect(dup).toBeNull();
  });

  it("returns null when the destination is not open elsewhere", () => {
    const source = makeEditorTab({ file: pathDescriptor("/p/A.mdi") });
    const other = makeEditorTab({ file: pathDescriptor("/p/C.mdi") });
    const tabs: TabState[] = [source, other];

    expect(findDuplicatePathTab(tabs, "/p/B.mdi", source.id)).toBeNull();
  });

  it("ignores untitled (path-less) tabs", () => {
    const source = makeEditorTab({ file: pathDescriptor("/p/B.mdi") });
    const untitled = makeEditorTab({ file: null });
    const tabs: TabState[] = [source, untitled];

    expect(findDuplicatePathTab(tabs, "/p/B.mdi", source.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findDuplicateByHandle — web File System Access handle collisions
// ---------------------------------------------------------------------------

describe("findDuplicateByHandle (#1872)", () => {
  it("detects a same-identity handle in another tab", async () => {
    const handle = makeHandle("B.mdi");
    const source = makeEditorTab({
      file: { path: null, handle: makeHandle("A.mdi"), name: "A.mdi" },
    });
    const existing = makeEditorTab({ file: { path: null, handle, name: "B.mdi" } });

    const dup = await findDuplicateByHandle([source, existing], handle, source.id);

    expect(dup?.id).toBe(existing.id);
  });

  it("detects a distinct handle object that isSameEntry() reports equal", async () => {
    const existingHandle = makeHandle("B.mdi");
    // The saved handle is a different object but points at the same file.
    const savedHandle = makeHandle("B.mdi", [existingHandle]);
    // Make the comparison symmetric for robustness.
    (existingHandle.isSameEntry as ReturnType<typeof vi.fn>).mockImplementation(
      async (other: FileSystemFileHandle) => other === savedHandle,
    );

    const source = makeEditorTab({
      file: { path: null, handle: makeHandle("A.mdi"), name: "A.mdi" },
    });
    const existing = makeEditorTab({ file: { path: null, handle: existingHandle, name: "B.mdi" } });

    const dup = await findDuplicateByHandle([source, existing], savedHandle, source.id);

    expect(dup?.id).toBe(existing.id);
    expect(existingHandle.isSameEntry).toHaveBeenCalledWith(savedHandle);
  });

  it("returns null when no other tab points at the same entry", async () => {
    const savedHandle = makeHandle("B.mdi");
    const otherHandle = makeHandle("C.mdi"); // isSameEntry → false for everything
    const source = makeEditorTab({
      file: { path: null, handle: makeHandle("A.mdi"), name: "A.mdi" },
    });
    const other = makeEditorTab({ file: { path: null, handle: otherHandle, name: "C.mdi" } });

    expect(await findDuplicateByHandle([source, other], savedHandle, source.id)).toBeNull();
  });

  it("fails open (no duplicate) when isSameEntry throws", async () => {
    const throwingHandle = makeHandle("B.mdi");
    (throwingHandle.isSameEntry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const savedHandle = makeHandle("B.mdi");
    const source = makeEditorTab({
      file: { path: null, handle: makeHandle("A.mdi"), name: "A.mdi" },
    });
    const other = makeEditorTab({ file: { path: null, handle: throwingHandle, name: "B.mdi" } });

    expect(await findDuplicateByHandle([source, other], savedHandle, source.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveSaveAsDuplicate — descriptor dispatch
// ---------------------------------------------------------------------------

describe("resolveSaveAsDuplicate (#1872)", () => {
  it("uses path matching when the descriptor has a path", async () => {
    const source = makeEditorTab({ file: pathDescriptor("/p/B.mdi") });
    const existing = makeEditorTab({ file: pathDescriptor("/p/B.mdi") });

    // Two tabs already share the path (the bug state). The source must not be
    // flagged; the OTHER one is the duplicate to consolidate away.
    const { duplicateTab } = await resolveSaveAsDuplicate(
      [source, existing],
      pathDescriptor("/p/B.mdi"),
      source.id,
    );

    expect(duplicateTab?.id).toBe(existing.id);
  });

  it("uses handle matching when the descriptor is path-less", async () => {
    const handle = makeHandle("B.mdi");
    const source = makeEditorTab({
      file: { path: null, handle: makeHandle("A.mdi"), name: "A.mdi" },
    });
    const existing = makeEditorTab({ file: { path: null, handle, name: "B.mdi" } });

    const { duplicateTab } = await resolveSaveAsDuplicate(
      [source, existing],
      { path: null, handle, name: "B.mdi" },
      source.id,
    );

    expect(duplicateTab?.id).toBe(existing.id);
  });

  it("reports no duplicate for a genuinely new destination", async () => {
    const source = makeEditorTab({ file: pathDescriptor("/p/A.mdi") });
    const { duplicateTab } = await resolveSaveAsDuplicate(
      [source],
      pathDescriptor("/p/new.mdi"),
      source.id,
    );
    expect(duplicateTab).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Consolidation contract — simulate saveAsFile's post-save behavior
// ---------------------------------------------------------------------------

describe("Save-As consolidation never leaves two tabs on one path (#1872)", () => {
  /**
   * Mirrors the saveAsFile consolidation step: after a save to `destPath`,
   * the source tab keeps the just-saved content and any duplicate tab is
   * removed so only ONE tab references the path.
   */
  function consolidate(
    tabs: EditorTabState[],
    sourceId: string,
    destDescriptor: MdiFileDescriptor,
  ): { tabs: EditorTabState[]; warned: boolean } {
    // Source tab descriptor is updated by the save executor.
    let next = tabs.map((t) =>
      t.id === sourceId ? { ...t, file: destDescriptor, isDirty: false } : t,
    );
    const dup = findDuplicatePathTab(next, destDescriptor.path ?? "", sourceId);
    let warned = false;
    if (dup) {
      next = next.filter((t) => t.id !== dup.id);
      warned = true;
    }
    return { tabs: next, warned };
  }

  it("removes the stale duplicate tab and warns", () => {
    const source = makeEditorTab({ file: pathDescriptor("/p/A.mdi"), content: "A content" });
    const existing = makeEditorTab({ file: pathDescriptor("/p/B.mdi"), content: "stale B" });

    const { tabs, warned } = consolidate([source, existing], source.id, pathDescriptor("/p/B.mdi"));

    const onBPath = tabs.filter((t) => t.file?.path === "/p/B.mdi");
    expect(onBPath).toHaveLength(1);
    expect(onBPath[0].id).toBe(source.id);
    expect(warned).toBe(true);
  });

  it("does nothing for a non-colliding Save-As", () => {
    const source = makeEditorTab({ file: pathDescriptor("/p/A.mdi") });
    const { tabs, warned } = consolidate([source], source.id, pathDescriptor("/p/new.mdi"));

    expect(tabs).toHaveLength(1);
    expect(warned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Warning copy
// ---------------------------------------------------------------------------

describe("saveAsDuplicateWarning", () => {
  it("includes the file name and is Japanese", () => {
    const msg = saveAsDuplicateWarning("B.mdi");
    expect(msg).toContain("B.mdi");
    // The clean-duplicate copy must accurately say the other tab was closed,
    // and must NOT claim a content merge ("統合") — nothing is ever merged.
    expect(msg).toContain("閉じました");
    expect(msg).not.toContain("統合");
  });

  it("uses a distinct, non-destructive copy when the duplicate is dirty", () => {
    const msg = saveAsDuplicateWarning("B.mdi", true);
    expect(msg).toContain("B.mdi");
    expect(msg).toContain("未保存");
    // Must NOT claim the tab was already closed (close is deferred to dialog).
    expect(msg).not.toContain("閉じました");
    expect(msg).not.toContain("統合");
  });
});
