import { describe, it, expect } from "vitest";

import { MAX_SNAPSHOTS, RETENTION_DAYS } from "@/lib/services/history-policy";

import { ensureProjectFiles } from "../project-file-utils";
import type { AnyDirectoryHandle } from "../project-file-utils";

// ---------------------------------------------------------------------------
// In-memory fake directory/file handles (VFS-style: read()/write()).
// ---------------------------------------------------------------------------

class FakeFile {
  content: string;
  constructor(content = "") {
    this.content = content;
  }
  async read(): Promise<string> {
    return this.content;
  }
  async write(s: string): Promise<void> {
    this.content = s;
  }
}

class FakeDir {
  name: string;
  files = new Map<string, FakeFile>();
  dirs = new Map<string, FakeDir>();

  constructor(name: string) {
    this.name = name;
  }

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    let dir = this.dirs.get(name);
    if (!dir) {
      if (!opts?.create) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      dir = new FakeDir(name);
      this.dirs.set(name, dir);
    }
    return dir;
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    let file = this.files.get(name);
    if (!file) {
      if (!opts?.create) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      file = new FakeFile("");
      this.files.set(name, file);
    }
    return file;
  }

  async *entries(): AsyncIterable<[string, { kind: "file" | "directory" }]> {
    for (const name of this.files.keys()) yield [name, { kind: "file" }];
    for (const name of this.dirs.keys()) yield [name, { kind: "directory" }];
  }
}

/** Create a fake project root with the given top-level files. */
function makeRoot(name: string, topLevelFiles: string[] = []): FakeDir {
  const root = new FakeDir(name);
  for (const f of topLevelFiles) root.files.set(f, new FakeFile("manuscript"));
  return root;
}

/** Seed a file at a slash-separated relative path, creating intermediate dirs. */
async function seedFile(root: FakeDir, relPath: string, content: string): Promise<void> {
  const parts = relPath.split("/");
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  await handle.write(content);
}

/** Seed a `.illusions/<relPath>` file (relPath may be nested, e.g. history/index.json). */
function seedIllusionsFile(root: FakeDir, relPath: string, content: string): Promise<void> {
  return seedFile(root, `.illusions/${relPath}`, content);
}

async function readIllusionsFile(root: FakeDir, name: string): Promise<string> {
  const illusions = await root.getDirectoryHandle(".illusions", { create: false });
  const handle = await illusions.getFileHandle(name, { create: false });
  return handle.read();
}

const asHandle = (dir: FakeDir): AnyDirectoryHandle => dir as unknown as AnyDirectoryHandle;

// ---------------------------------------------------------------------------
// ensureProjectFiles
// ---------------------------------------------------------------------------
describe("ensureProjectFiles", () => {
  it("「花様年華」再現: project.json のみ欠落 → projectId を再利用して復元", async () => {
    // 本文 + workspace.json + history は在るが project.json だけ無い状態
    const root = makeRoot("花様年華", ["花様年華.mdi"]);
    await seedIllusionsFile(root, "workspace.json", JSON.stringify({ openTabs: [] }));

    const result = await ensureProjectFiles(asHandle(root), {
      projectId: "recent-id-123",
    });

    expect(result.repaired).toBe(true);
    expect(result.metadata.projectId).toBe("recent-id-123");
    expect(result.metadata.name).toBe("花様年華");
    expect(result.metadata.mainFile).toBe("花様年華.mdi");
    expect(result.metadata.mainFileExtension).toBe(".mdi");

    // 実ファイルが書き込まれている
    const written = JSON.parse(await readIllusionsFile(root, "project.json"));
    expect(written.projectId).toBe("recent-id-123");
  });

  it("既存の有効な project.json は上書きせず projectId も保持する", async () => {
    const root = makeRoot("既存", ["既存.mdi"]);
    const existing = {
      version: "1.0.0",
      projectId: "original-id",
      name: "既存",
      mainFile: "既存.mdi",
      mainFileExtension: ".mdi",
      createdAt: 1,
      lastModified: 2,
      editorSettings: {},
    };
    await seedIllusionsFile(root, "project.json", JSON.stringify(existing));
    await seedIllusionsFile(root, "workspace.json", JSON.stringify({ openTabs: [] }));
    await seedIllusionsFile(
      root,
      "history/index.json",
      JSON.stringify({ snapshots: [], maxSnapshots: 100, retentionDays: 90 }),
    );

    const result = await ensureProjectFiles(asHandle(root), { projectId: "should-be-ignored" });

    expect(result.repaired).toBe(false);
    expect(result.metadata.projectId).toBe("original-id");
  });

  it("mainFile 未指定: ${dirName}.mdi を優先検出する", async () => {
    const root = makeRoot("MyProject", ["MyProject.mdi", "memo.md"]);
    const result = await ensureProjectFiles(asHandle(root));
    expect(result.metadata.mainFile).toBe("MyProject.mdi");
  });

  it("mainFile 未指定: .mdi が無ければ .md → .txt の優先順で検出する", async () => {
    const root = makeRoot("Proj", ["note.txt", "draft.md"]);
    const result = await ensureProjectFiles(asHandle(root));
    expect(result.metadata.mainFile).toBe("draft.md");
    expect(result.metadata.mainFileExtension).toBe(".md");
  });

  it("workspace.json 欠落 → 既定値で補完", async () => {
    const root = makeRoot("WS", ["WS.mdi"]);
    await seedIllusionsFile(
      root,
      "project.json",
      JSON.stringify({ projectId: "x", name: "WS", mainFile: "WS.mdi", mainFileExtension: ".mdi" }),
    );
    // workspace.json は無し

    const result = await ensureProjectFiles(asHandle(root));

    expect(result.repaired).toBe(true);
    const ws = JSON.parse(await readIllusionsFile(root, "workspace.json"));
    expect(ws).toBeTruthy();
  });

  it("history/index.json 欠落 → 既定の HistoryIndex で補完", async () => {
    const root = makeRoot("H", ["H.mdi"]);
    await seedIllusionsFile(
      root,
      "project.json",
      JSON.stringify({ projectId: "x", name: "H", mainFile: "H.mdi", mainFileExtension: ".mdi" }),
    );
    await seedIllusionsFile(root, "workspace.json", JSON.stringify({ openTabs: [] }));

    const result = await ensureProjectFiles(asHandle(root));

    expect(result.repaired).toBe(true);
    const historyDir = await root.getDirectoryHandle(".illusions", { create: false });
    const hDir = await historyDir.getDirectoryHandle("history", { create: false });
    const idx = JSON.parse(await (await hDir.getFileHandle("index.json")).read());
    expect(idx.snapshots).toEqual([]);
    expect(idx.maxSnapshots).toBe(MAX_SNAPSHOTS);
    expect(idx.retentionDays).toBe(RETENTION_DAYS);
  });

  it("全ファイル健在 → 何も書かず repaired:false", async () => {
    const root = makeRoot("Full", ["Full.mdi"]);
    await seedIllusionsFile(
      root,
      "project.json",
      JSON.stringify({
        projectId: "keep",
        name: "Full",
        mainFile: "Full.mdi",
        mainFileExtension: ".mdi",
      }),
    );
    await seedIllusionsFile(root, "workspace.json", JSON.stringify({ openTabs: [] }));
    await seedIllusionsFile(
      root,
      "history/index.json",
      JSON.stringify({ snapshots: [], maxSnapshots: MAX_SNAPSHOTS, retentionDays: RETENTION_DAYS }),
    );

    const result = await ensureProjectFiles(asHandle(root));
    expect(result.repaired).toBe(false);
    expect(result.metadata.projectId).toBe("keep");
  });

  it(".illusions 自体が無い空フォルダ + 本文在 → 一式生成、repaired:true", async () => {
    const root = makeRoot("Scratch", ["Scratch.mdi"]);
    const result = await ensureProjectFiles(asHandle(root));

    expect(result.repaired).toBe(true);
    expect(result.metadata.mainFile).toBe("Scratch.mdi");
    // project.json / workspace.json / history/index.json がすべて作られる
    expect(await readIllusionsFile(root, "project.json")).toBeTruthy();
    expect(await readIllusionsFile(root, "workspace.json")).toBeTruthy();
  });

  it("本文ファイルが 1 つも無い → 検出は空、${dirName}.mdi にフォールバック", async () => {
    const root = makeRoot("Empty", []);
    const result = await ensureProjectFiles(asHandle(root));
    expect(result.repaired).toBe(true);
    expect(result.metadata.mainFile).toBe("Empty.mdi");
  });
});
