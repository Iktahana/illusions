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

type FakeRow = {
  entry: string;
  reading_primary: string;
  raw_json: string;
  variantWritings?: string[];
};

class FakeStatement {
  constructor(
    private readonly sql: string,
    private readonly rows: FakeRow[],
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
      return this.rows
        .filter((r) => wanted.has(r.entry))
        .map((r) => ({ entry: r.entry, raw_json: r.raw_json }));
    }
    if (this.sql.includes("WHERE reading_primary IN")) {
      const wanted = new Set(args as string[]);
      return this.rows
        .filter((r) => wanted.has(r.reading_primary))
        .map((r) => ({ reading_primary: r.reading_primary, raw_json: r.raw_json }));
    }
    // #1958 variant_lookup JOIN — batch form: WHERE vl.variant IN (...)
    if (this.sql.includes("variant_lookup") && this.sql.includes("vl.variant IN")) {
      const wanted = new Set(args as string[]);
      const out: Array<{ variant: string; raw_json: string }> = [];
      for (const r of this.rows) {
        for (const v of r.variantWritings ?? []) {
          if (wanted.has(v)) out.push({ variant: v, raw_json: r.raw_json });
        }
      }
      return out;
    }
    // #1958 variant_lookup JOIN — single form: WHERE vl.variant = ? LIMIT ?
    if (this.sql.includes("variant_lookup") && this.sql.includes("vl.variant = ?")) {
      const [term] = args as string[];
      return this.rows
        .filter((r) => (r.variantWritings ?? []).includes(term))
        .map((r) => ({ raw_json: r.raw_json }));
    }
    return [];
  }
  run(): void {}
}

class FakeDatabase {
  constructor(
    private readonly rows: FakeRow[],
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
  variantWritings?: string[];
  needsGloss?: boolean;
}

function rawJson(input: RawJsonInput): string {
  const meta: Record<string, unknown> = {};
  if (input.freqRank !== undefined) meta.freq_rank = input.freqRank;
  if (input.variantWritings) meta.variant_writings = input.variantWritings;
  if (input.needsGloss !== undefined) meta.needs_gloss = input.needsGloss;
  return JSON.stringify({
    uuid: `uuid-${input.entry}`,
    entry: input.entry,
    reading: { primary: input.reading, alternatives: [] },
    grammar: { pos: input.pos ?? null },
    definitions: input.register
      ? [{ index: 0, gloss: "x", register: input.register }]
      : [{ index: 0, gloss: "x" }],
    relations: { homophones: [], synonyms: [], antonyms: [], related: [] },
    meta,
  });
}

interface TestableManager {
  _getDictDir: () => string;
  _createDatabase: (dbPath: string, opts?: unknown) => unknown;
  verify: () => { ok: boolean; reason?: string };
  lookupBatch: (
    terms: string[],
    normalize?: boolean,
  ) => Array<{
    entry: string;
    found: boolean;
    reading?: string;
    pos?: string;
    register?: string;
    freqRank?: number;
  }>;
  getStatus: () => { status: string; installedVersion?: string };
}

interface ManagerOptions {
  rows?: RawJsonInput[];
  mode?: DbMode;
}

async function freshManager(dictDir: string, opts: ManagerOptions = {}): Promise<TestableManager> {
  const { rows = [], mode = "healthy" } = opts;
  const fakeRows = rows.map((r) => ({
    entry: r.entry,
    reading_primary: r.reading,
    raw_json: rawJson(r),
    variantWritings: r.variantWritings,
  }));
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
        {
          entry: "雪",
          found: true,
          reading: "ゆき",
          pos: "名詞",
          register: "文章語",
          freqRank: 1200,
        },
      ]);
    });

    it("omits terms with no match and dedupes input", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: LOOKUP_ROWS });
      const entries = mgr
        .lookupBatch(["雪", "存在しない語", "走る", "雪"])
        .map((r) => r.entry)
        .sort();
      expect(entries).toEqual(["走る", "雪"]);
    });

    it("returns [] for an empty request", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: LOOKUP_ROWS });
      expect(mgr.lookupBatch([])).toEqual([]);
      expect(mgr.lookupBatch(["", "  "].map((s) => s.trim()))).toEqual([]);
    });
  });

  describe("lookupBatch() kana reading normalization (#1935)", () => {
    // Dictionary stores verbs under their kanji headword with a kana reading.
    const NORMALIZE_ROWS: RawJsonInput[] = [
      { entry: "有る", reading: "ある", pos: ["動詞"] },
      { entry: "分かる", reading: "わかる", pos: ["動詞"] },
      { entry: "読む", reading: "よむ", pos: ["動詞"] },
      { entry: "雪", reading: "ゆき", pos: ["名詞"] },
    ];

    it("resolves an all-kana term to its kanji headword via the reading index", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: NORMALIZE_ROWS });
      // 「ある」 (kana) misses the headword index but its reading matches 有る.
      const hit = mgr.lookupBatch(["ある"]);
      expect(hit).toEqual([{ entry: "ある", found: true, reading: "ある", pos: "動詞" }]);
    });

    it("does NOT flag kana content words 「ある」「わかる」 as out-of-dictionary", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: NORMALIZE_ROWS });
      const found = new Set(mgr.lookupBatch(["ある", "わかる"]).map((r) => r.entry));
      expect(found.has("ある")).toBe(true);
      expect(found.has("わかる")).toBe(true);
    });

    it("STILL flags genuinely out-of-dictionary terms with kanji (圕 / 讀む)", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: NORMALIZE_ROWS });
      // 讀む shares reading よむ with 読む, but the kana gate skips it (讀 is kanji),
      // so it must NOT be over-suppressed. 圕 is absent and not kana.
      const found = new Set(mgr.lookupBatch(["圕", "讀む"]).map((r) => r.entry));
      expect(found.has("圕")).toBe(false);
      expect(found.has("讀む")).toBe(false);
    });

    it("normalize:false disables the reading fallback (strict headword match)", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: NORMALIZE_ROWS });
      expect(mgr.lookupBatch(["ある"], false)).toEqual([]);
    });
  });

  describe("variant-writings resolution (#1958)", () => {
    // 居る absorbs the historical-kana writing ゐる; 来 absorbs the old-kanji 來.
    const VARIANT_ROWS: RawJsonInput[] = [
      { entry: "居る", reading: "いる", pos: ["動詞"], variantWritings: ["ゐる"] },
      { entry: "来", reading: "く", pos: ["動詞"], variantWritings: ["來"] },
      { entry: "雪", reading: "ゆき", pos: ["名詞"] },
    ];

    it("resolves a variant writing to its canonical headword in lookupBatch (ゐる→居る)", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: VARIANT_ROWS });
      const hit = mgr.lookupBatch(["ゐる"]);
      // Keyed by the requested term; found:true so the 辞書外語 rule won't flag it.
      expect(hit).toEqual([{ entry: "ゐる", found: true, reading: "いる", pos: "動詞" }]);
    });

    it("does NOT flag old-kanji/old-kana manuscript words as out-of-dictionary", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: VARIANT_ROWS });
      const found = new Set(mgr.lookupBatch(["ゐる", "來"]).map((r) => r.entry));
      expect(found.has("ゐる")).toBe(true);
      expect(found.has("來")).toBe(true);
    });

    it("prefers an exact headword hit over the variant fallback", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: VARIANT_ROWS });
      // 居る matches the headword directly — must resolve there, not via variant.
      const hit = mgr.lookupBatch(["居る"]);
      expect(hit).toEqual([{ entry: "居る", found: true, reading: "いる", pos: "動詞" }]);
    });

    it("normalize:false disables the variant fallback", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: VARIANT_ROWS });
      expect(mgr.lookupBatch(["ゐる"], false)).toEqual([]);
    });

    it("query() resolves a variant writing to the canonical entry (panel path)", async () => {
      fs.writeFileSync(dbPath, "sqlite");
      const mgr = await freshManager(dictDir, { rows: VARIANT_ROWS });
      const entries = (
        mgr as unknown as { query: (t: string, l?: number) => Array<{ entry: string }> }
      ).query("ゐる");
      expect(entries.map((e) => e.entry)).toEqual(["居る"]);
    });
  });
});
