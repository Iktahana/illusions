import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapRawJsonToDictEntry, queryByEntry, queryByReading } from "../genji-api-backend";

// ---------------------------------------------------------------------------
// Sample raw_json fixture
// ---------------------------------------------------------------------------

const SAMPLE_RAW = {
  uuid: "dde85894-4cca-592d-bdfe-c1c7789e4e18",
  entry: "雪",
  reading: {
    primary: "ゆき",
    alternatives: ["せつ"],
    is_heteronym: false,
  },
  grammar: {
    pos: ["名詞"],
    ctype: null,
    inflections: null,
  },
  definitions: [
    {
      index: 1,
      gloss: "snow",
      register: "standard",
      nuance: null,
      collocations: ["積雪", "降雪"],
      examples: {
        standard: [
          { text: "雪が降る。", source: "幻辞" },
          { text: "雪の日。", source: "幻辞" },
        ],
        literary: [
          {
            text: "記憶は雪のふるやうなもの",
            citation: { source: "記憶", author: "萩原朔太郎", note: "青空文庫" },
          },
        ],
      },
    },
    {
      index: 2,
      gloss: "something white",
      register: "literary",
      nuance: "poetic usage",
      collocations: [],
      examples: { standard: [], literary: [] },
    },
  ],
  relations: {
    homophones: ["行き"],
    synonyms: [],
    antonyms: [],
    related: ["吹雪", "雪崩"],
  },
  meta: {
    version: "1.0.0",
    source: "JMdict",
    updated_at: "2026-04-05T00:00:00Z",
    freq_rank: 1675,
  },
};

// ---------------------------------------------------------------------------
// mapRawJsonToDictEntry
// ---------------------------------------------------------------------------

describe("mapRawJsonToDictEntry", () => {
  it("maps core fields correctly", () => {
    const entry = mapRawJsonToDictEntry(SAMPLE_RAW);

    expect(entry.id).toBe("dde85894-4cca-592d-bdfe-c1c7789e4e18");
    expect(entry.entry).toBe("雪");
    expect(entry.source).toBe("genji");
    expect(entry.reading.primary).toBe("ゆき");
    expect(entry.reading.alternatives).toEqual(["せつ"]);
    expect(entry.partOfSpeech).toBe("名詞");
    expect(entry.inflections).toBeUndefined();
  });

  it("flattens examples from standard + literary", () => {
    const entry = mapRawJsonToDictEntry(SAMPLE_RAW);

    const examples = entry.definitions[0].examples ?? [];
    expect(examples.map((e) => e.text)).toEqual([
      "雪が降る。",
      "雪の日。",
      "記憶は雪のふるやうなもの",
    ]);
    expect(examples[0]?.source).toBe("幻辞");
    expect(examples[2]?.citation).toEqual({
      source: "記憶",
      author: "萩原朔太郎",
      note: "青空文庫",
    });
  });

  it("maps multiple definitions", () => {
    const entry = mapRawJsonToDictEntry(SAMPLE_RAW);

    expect(entry.definitions).toHaveLength(2);
    expect(entry.definitions[0].gloss).toBe("snow");
    expect(entry.definitions[0].register).toBe("standard");
    expect(entry.definitions[0].collocations).toEqual(["積雪", "降雪"]);
    expect(entry.definitions[1].gloss).toBe("something white");
    expect(entry.definitions[1].nuance).toBe("poetic usage");
  });

  it("maps relationships", () => {
    const entry = mapRawJsonToDictEntry(SAMPLE_RAW);

    expect(entry.relationships.homophones).toEqual(["行き"]);
    expect(entry.relationships.related).toEqual(["吹雪", "雪崩"]);
  });

  it("handles null/missing optional fields gracefully", () => {
    const minimal = {
      uuid: "abc-123",
      entry: "テスト",
      reading: { primary: "てすと", alternatives: [] },
      grammar: { pos: null, ctype: null, inflections: null },
      definitions: [],
      relations: { homophones: [], synonyms: [], antonyms: [], related: [] },
    };

    const entry = mapRawJsonToDictEntry(minimal);

    expect(entry.partOfSpeech).toBeUndefined();
    expect(entry.inflections).toBeUndefined();
    expect(entry.definitions).toEqual([]);
  });

  it("joins multiple pos with ・", () => {
    const raw = {
      ...SAMPLE_RAW,
      grammar: { pos: ["名詞", "副詞"], ctype: null, inflections: null },
    };
    const entry = mapRawJsonToDictEntry(raw);
    expect(entry.partOfSpeech).toBe("名詞・副詞");
  });
});

// ---------------------------------------------------------------------------
// queryByEntry / queryByReading (mock fetch)
// ---------------------------------------------------------------------------

describe("queryByEntry", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns mapped DictEntry[] on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [{ raw_json: JSON.stringify(SAMPLE_RAW) }] }),
    });

    const results = await queryByEntry("雪", 20);

    expect(results).toHaveLength(1);
    expect(results[0].entry).toBe("雪");
    expect(results[0].definitions[0].gloss).toBe("snow");
  });

  it("returns [] on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const results = await queryByEntry("雪", 20);
    expect(results).toEqual([]);
  });

  it("returns [] on non-ok HTTP response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const results = await queryByEntry("雪", 20);
    expect(results).toEqual([]);
  });

  it("handles raw_json as already-parsed object", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [{ raw_json: SAMPLE_RAW }] }),
    });

    const results = await queryByEntry("雪", 20);
    expect(results).toHaveLength(1);
    expect(results[0].entry).toBe("雪");
  });
});

describe("queryByReading", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns mapped entries for reading search", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [{ raw_json: JSON.stringify(SAMPLE_RAW) }] }),
    });

    const results = await queryByReading("ゆき", 20);

    expect(results).toHaveLength(1);
    expect(results[0].reading.primary).toBe("ゆき");
  });
});
