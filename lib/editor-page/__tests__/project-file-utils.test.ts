import { describe, it, expect, vi } from "vitest";

import { MAX_SNAPSHOTS, RETENTION_DAYS } from "@/lib/services/history-policy";

import { ensureProjectFiles, readProjectJson } from "../project-file-utils";
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

  it("破損 project.json (不完全な JSON) → バックアップに退避してデフォルト再生成", async () => {
    const root = makeRoot("Corrupt", ["Corrupt.mdi"]);
    // Simulate a truncated write (the failure scenario from issue #1565).
    await seedIllusionsFile(root, "project.json", '{"version":"1.0');
    await seedIllusionsFile(root, "workspace.json", JSON.stringify({ openTabs: [] }));

    const result = await ensureProjectFiles(asHandle(root), { projectId: "new-id" });

    expect(result.repaired).toBe(true);
    // Fresh metadata was generated with the supplied projectId.
    expect(result.metadata.projectId).toBe("new-id");
    expect(result.metadata.mainFile).toBe("Corrupt.mdi");

    // A backup file starting with "project.json.corrupt-" should have been created.
    const illusionsDir = await root.getDirectoryHandle(".illusions", { create: false });
    const illusionsFiles: string[] = [];
    for await (const [name] of (illusionsDir as unknown as FakeDir).entries()) {
      illusionsFiles.push(name);
    }
    const backupFile = illusionsFiles.find((n) => n.startsWith("project.json.corrupt-"));
    expect(backupFile).toBeDefined();
    // The backup should contain the original corrupt content.
    const backupHandle = await (illusionsDir as unknown as FakeDir).getFileHandle(backupFile!, {
      create: false,
    });
    expect(await backupHandle.read()).toBe('{"version":"1.0');
  });

  it("破損 project.json: バックアップ成功時の warn は退避先を正しく報告する", async () => {
    const root = makeRoot("CorruptOk", ["CorruptOk.mdi"]);
    await seedIllusionsFile(root, "project.json", '{"version":"1.0');

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await ensureProjectFiles(asHandle(root), { projectId: "regen-ok" });

      const corruptWarn = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .find((message) => message.includes("project.json が破損"));
      expect(corruptWarn).toBeDefined();
      expect(corruptWarn).toContain("に退避し、");
      expect(corruptWarn).not.toContain("失敗");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("破損 project.json: バックアップ作成に失敗 → 退避成功と偽らない warn を出して再生成 (#1567)", async () => {
    const root = makeRoot("CorruptNoBackup", ["CorruptNoBackup.mdi"]);
    await seedIllusionsFile(root, "project.json", '{"version":"1.0');

    // Make backup-file creation fail (e.g. read-only / quota error) while
    // project.json itself stays writable for regeneration.
    const illusionsDir = await root.getDirectoryHandle(".illusions", { create: false });
    const originalGetFileHandle = illusionsDir.getFileHandle.bind(illusionsDir);
    illusionsDir.getFileHandle = async (name, opts): Promise<FakeFile> => {
      if (name.startsWith("project.json.corrupt-")) {
        throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      }
      return originalGetFileHandle(name, opts);
    };

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await ensureProjectFiles(asHandle(root), { projectId: "regen-id" });

      // Regeneration still succeeds despite the backup failure.
      expect(result.repaired).toBe(true);
      expect(result.metadata.projectId).toBe("regen-id");

      // The warn must NOT claim the backup succeeded (「...に退避し、...」).
      const corruptWarn = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .find((message) => message.includes("project.json が破損"));
      expect(corruptWarn).toBeDefined();
      expect(corruptWarn).toContain("失敗");
      expect(corruptWarn).not.toContain("に退避し、");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// readProjectJson — corrupted file returns null (self-heal via caller)
// ---------------------------------------------------------------------------
describe("readProjectJson", () => {
  it("破損 project.json (不完全な JSON) → null を返して例外を伝播させない", async () => {
    const root = makeRoot("ReadCorrupt", ["ReadCorrupt.mdi"]);
    await seedIllusionsFile(root, "project.json", '{"version":"1.0');

    const result = await readProjectJson(asHandle(root));

    // Must not throw; must return null so caller can call ensureProjectFiles.
    expect(result).toBeNull();
  });

  it("有効な project.json → metadata を返す", async () => {
    const root = makeRoot("ReadValid", ["ReadValid.mdi"]);
    const valid = {
      version: "1.0.0",
      projectId: "valid-id",
      name: "ReadValid",
      mainFile: "ReadValid.mdi",
      mainFileExtension: ".mdi",
      createdAt: 1,
      lastModified: 2,
      editorSettings: {},
    };
    await seedIllusionsFile(root, "project.json", JSON.stringify(valid));

    const result = await readProjectJson(asHandle(root));

    expect(result).not.toBeNull();
    expect(result!.metadata.projectId).toBe("valid-id");
  });
});
