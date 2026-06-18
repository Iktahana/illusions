import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Backend tests for the analysis-access additions to DictManager (#1624):
 *   - verify()      — fast integrity check (ok / not-installed / schema / malformed)
 *   - lookupBatch() — exact-match lightweight projection
 *   - getStatus()   — reports "corrupt" once the flag is tripped
 *
 * The real better-sqlite3 can't open here (the local copy is rebuilt for
 * Electron's ABI) and vitest externalizes the native module so it can't be
 * vi.mock'd. Instead we inject a fake DB through the manager's `_createDatabase`
 * seam — the same override style as `_getDictDir` in dict-manager.test.ts —
 * which still exercises the manager's projection / grouping / corruption logic.
 */

const { appGetPathMock } = vi.hoisted(() => ({
  appGetPathMock: vi.fn(() => "/tmp/illusions-dict-access-test"),
}));

vi.mock("electron", () => ({
  app: { getPath: appGetPathMock },
}));

type DbMode = "healthy" | "no-table" | "malformed";

class FakeStatement {
  constructor(
    private readonly sql: string,
    private readonly rows: Array<{ entry: string; raw_json: string }>,
    private readonly mode: DbMode,
  ) {}
  get(): unknown {
    if (this.sql.includes("sqlite_master")) {
      return this.mode === "no-table" ? undefined : { name: "entries" };
    }
    if (this.sql.includes("LIMIT 1")) {
      return this.rows[0] ? { raw_json: this.rows[0].raw_json } : undefined;
    }
    return undefined;
  }
  all(...args: unknown[]): unknown[] {
    if (this.sql.includes("WHERE entry IN")) {
      const wanted = new Set(args as string[]);
      return this.rows.filter((r) => wanted.has(r.entry)).map((r) => ({ ...r }));
    }
    return [];
  }
  run(): void {}
}

class FakeDatabase {
  constructor(
    private readonly rows: Array<{ entry: string; raw_json: string }>,
    private readonly mode: DbMode,
  ) {
    if (mode === "malformed") throw new Error("file is not a database");
  }
  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this.rows, this.mode);
  }
  pragma(): void {}
  exec(): void {}
  close(): void {}
}

interface RawJsonInput {
  entry: string;
  reading: string;
  pos?: string[];
  register?: string;
  freqRank?: number;
}

function rawJson(input: RawJsonInput): string {
  return JSON.stringify({
    uuid: `uuid-${input.entry}`,
    entry: input.entry,
    reading: { primary: input.reading, alternatives: [] },
    grammar: { pos: input.pos ?? null },
    definitions: input.register
      ? [{ index: 0, gloss: "x", register: input.register }]
      : [{ index: 0, gloss: "x" }],
    relations: { homophones: [], synonyms: [], antonyms: [], related: [] },
    meta: input.freqRank !== undefined ? { freq_rank: input.freqRank } : {},
  });
}

interface TestableManager {
  _getDictDir: () => string;
  _createDatabase: (dbPath: string, opts?: unknown) => unknown;
  verify: () => { ok: boolean; reason?: string };
  lookupBatch: (
    terms: string[],
  ) => Array<{ entry: string; found: boolean; reading?: string; pos?: string; register?: string; freqRank?: number }>;
  getStatus: () => { status: string; installedVersion?: string };
}

interface ManagerOptions {
  rows?: RawJsonInput[];
  mode?: DbMode;
}

async function freshManager(dictDir: string, opts: ManagerOptions = {}): Promise<TestableManager> {
  const { rows = [], mode = "healthy" } = opts;
  const fakeRows = rows.map((r) => ({ entry: r.entry, raw_json: rawJson(r) }));
  const { getDictManager } = await import("../dict-manager.js");
  const mgr = getDictManager() as unknown as TestableManager;
  mgr._getDictDir = () => dictDir;
  mgr._createDatabase = () => new FakeDatabase(fakeRows, mode);
  return mgr;
}

describe("DictManager analysis access (#1624)", () => {
  let tempDir: string;
  let dictDir: string;
  let dbPath: string;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "illusions-dict-access-"));
    dictDir = path.join(tempDir, "dict");
    fs.mkdirSync(dictDir, { recursive: true });
    dbPath = path.join(dictDir, "genji.db");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const LOOKUP_ROWS: RawJsonInput[] = [
    { entry: "雪", reading: "ゆき", pos: ["名詞"], register: "文章語", freqRank: 1200 },
    { entry: "走る", reading: "はしる", pos: ["動詞"], freqRank: 800 },
  ];

  describe("verify()", () => {
    it("returns ok for a healthy DB with an entries table", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: [{ entry: "雪", reading: "ゆき" }] });
      expect(mgr.verify()).toEqual({ ok: true });
    });

    it("returns not-installed when the DB file is absent", async () => {
      const mgr = await freshManager(dictDir);
      expect(mgr.verify()).toEqual({ ok: false, reason: "not-installed" });
    });

    it("returns schema when the entries table is missing", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { mode: "no-table" });
      expect(mgr.verify()).toEqual({ ok: false, reason: "schema" });
    });

    it("returns malformed for a truncated / non-SQLite file", async () => {
      fs.writeFileSync(dbPath, "this is not a sqlite database");
      const mgr = await freshManager(dictDir, { mode: "malformed" });
      expect(mgr.verify()).toEqual({ ok: false, reason: "malformed" });
    });

    it("flips getStatus() to corrupt after a malformed verify", async () => {
      fs.writeFileSync(dbPath, "garbage");
      const mgr = await freshManager(dictDir, { mode: "malformed" });
      mgr.verify();
      expect(mgr.getStatus().status).toBe("corrupt");
    });
  });

  describe("lookupBatch()", () => {
    it("projects reading / pos / register / freqRank for hits", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: LOOKUP_ROWS });
      expect(mgr.lookupBatch(["雪"])).toEqual([
        { entry: "雪", found: true, reading: "ゆき", pos: "名詞", register: "文章語", freqRank: 1200 },
      ]);
    });

    it("omits terms with no match and dedupes input", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: LOOKUP_ROWS });
      const entries = mgr.lookupBatch(["雪", "存在しない語", "走る", "雪"]).map((r) => r.entry).sort();
      expect(entries).toEqual(["走る", "雪"]);
    });

    it("returns [] for an empty request", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: LOOKUP_ROWS });
      expect(mgr.lookupBatch([])).toEqual([]);
      expect(mgr.lookupBatch(["", "  "].map((s) => s.trim()))).toEqual([]);
    });
  });
});
