/**
 * Unit tests for DictManager.listNouns() + invalidateNounCache().
 *
 * We avoid loading dict-manager's CJS dependencies (electron, better-sqlite3)
 * by calling listNouns() directly on a manually constructed instance and
 * stubbing the private _openDb() hook with a fake DB cursor.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Suppress module-level require("electron") by stubbing it with a minimal shim.
vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
}));

interface FakeRow {
  entry: string;
  reading_primary: string | null;
  raw_json: string;
}

interface DictManagerLike {
  listNouns(): Array<{ entry: string; reading: string; pos: string[] }>;
  invalidateNounCache(): void;
  _downloadMutex: { _locked: boolean };
  _openDb: () => unknown;
}

function withRows(mgr: DictManagerLike, rows: FakeRow[]): void {
  mgr._openDb = () =>
    ({
      prepare: (_sql: string) => ({
        all: () => rows,
      }),
    }) as unknown;
}

describe("DictManager.listNouns", () => {
  let mgr: DictManagerLike;

  const baseRows: FakeRow[] = [
    {
      entry: "光君",
      reading_primary: "ひかるぎみ",
      raw_json: JSON.stringify({
        entry: "光君",
        reading: { primary: "ひかるぎみ" },
        grammar: { pos: ["名詞", "固有名詞"] },
      }),
    },
    {
      entry: "走る",
      reading_primary: "はしる",
      raw_json: JSON.stringify({
        entry: "走る",
        reading: { primary: "はしる" },
        grammar: { pos: ["動詞"] },
      }),
    },
    {
      entry: "紫",
      reading_primary: "むらさき",
      raw_json: JSON.stringify({
        entry: "紫",
        reading: { primary: "むらさき" },
        grammar: { pos: ["名詞"] },
      }),
    },
    {
      entry: "broken",
      reading_primary: null,
      raw_json: "{not-json",
    },
  ];

  beforeEach(async () => {
    vi.resetModules();
    const { getDictManager } = await import("../dict-manager");
    mgr = getDictManager() as unknown as DictManagerLike;
    mgr.invalidateNounCache();
    withRows(mgr, baseRows);
  });

  it("returns only noun entries based on grammar.pos", () => {
    const nouns = mgr.listNouns();
    const entries = nouns.map((n) => n.entry).sort();
    expect(entries).toEqual(["光君", "紫"]);
  });

  it("attaches reading from reading_primary", () => {
    const nouns = mgr.listNouns();
    const hikaru = nouns.find((n) => n.entry === "光君")!;
    expect(hikaru.reading).toBe("ひかるぎみ");
    expect(hikaru.pos).toContain("名詞");
  });

  it("returns cached result on subsequent calls", () => {
    const first = mgr.listNouns();
    const second = mgr.listNouns();
    expect(second).toBe(first);
  });

  it("invalidateNounCache forces a fresh read", () => {
    const first = mgr.listNouns();
    mgr.invalidateNounCache();
    const second = mgr.listNouns();
    expect(second).not.toBe(first);
    expect(second.map((n) => n.entry).sort()).toEqual(first.map((n) => n.entry).sort());
  });

  it("returns [] while the download mutex is locked", () => {
    mgr._downloadMutex._locked = true;
    try {
      expect(mgr.listNouns()).toEqual([]);
    } finally {
      mgr._downloadMutex._locked = false;
    }
  });
});
