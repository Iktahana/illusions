/**
 * Tests for WordFrequency's content-addressed cache validity (#1890).
 *
 * Bug: the persisted word-frequency cache was validated only against disk
 * metadata (schemaVersion + lastModified + fileSize). The real analysis input
 * is the live React `content` prop (which includes the unsaved buffer), so an
 * unsaved edit (disk mtime/size unchanged) served a stale cache, and a dirty
 * force-analysis tagged with disk meta survived a discard/revert.
 *
 * Fix: the cache carries a `contentHash` of the live content and is only valid
 * when that hash matches the content currently being analyzed.
 *
 * These tests cover:
 *   - hashContent stability / sensitivity
 *   - isWordCacheValid predicate (schema / hash / mtime / size gates)
 *   - End-to-end cache decisions over a fake VFS for the four required cases:
 *     (a) cache -> unsaved edit adds a new word -> reflected (cache miss)
 *     (b) unsaved edit -> save -> still reflected
 *     (c) dirty force-analysis -> discard -> next open shows DISK content stats
 *     (d) same size+mtime but DIFFERENT content invalidates
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { WordEntry } from "@/lib/nlp-client/types";
import { hashContent, isWordCacheValid } from "../WordFrequency";

// Mirror of the (non-exported) cache shape used by WordFrequency.tsx.
interface WordFrequencyCache {
  schemaVersion?: number;
  contentHash?: string;
  lastModified: number;
  fileSize: number;
  words: WordEntry[];
  totalWords: number;
  uniqueWords: number;
  analyzedAt: number;
}

// Must match CACHE_SCHEMA_VERSION in WordFrequency.tsx.
const CACHE_SCHEMA_VERSION = 3;

const META = { lastModified: 1000, size: 42 } as const;

function makeCache(
  content: string,
  overrides: Partial<WordFrequencyCache> = {},
): WordFrequencyCache {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    contentHash: hashContent(content),
    lastModified: META.lastModified,
    fileSize: META.size,
    words: [],
    totalWords: 0,
    uniqueWords: 0,
    analyzedAt: 123,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hashContent
// ---------------------------------------------------------------------------

describe("hashContent", () => {
  it("is stable for identical content", () => {
    expect(hashContent("吾輩は猫である")).toBe(hashContent("吾輩は猫である"));
  });

  it("differs for different content", () => {
    expect(hashContent("吾輩は猫である")).not.toBe(hashContent("吾輩は犬である"));
  });

  it("returns an 8-char lowercase hex string", () => {
    expect(hashContent("anything")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("distinguishes content of the same length (collision sanity)", () => {
    // Same character count, different bytes — must not collide trivially.
    expect(hashContent("ab")).not.toBe(hashContent("ba"));
  });
});

// ---------------------------------------------------------------------------
// isWordCacheValid
// ---------------------------------------------------------------------------

describe("isWordCacheValid", () => {
  it("accepts a cache whose hash + meta match the current content", () => {
    const content = "本文テキスト";
    expect(isWordCacheValid(makeCache(content), META, content)).toBe(true);
  });

  it("rejects when contentHash does not match (dirty buffer)", () => {
    const diskCache = makeCache("disk content");
    // Live content differs (unsaved edit) but disk meta is unchanged.
    expect(isWordCacheValid(diskCache, META, "dirty content")).toBe(false);
  });

  it("rejects an outdated schemaVersion even if hash + meta match", () => {
    const content = "本文";
    const cache = makeCache(content, { schemaVersion: CACHE_SCHEMA_VERSION - 1 });
    expect(isWordCacheValid(cache, META, content)).toBe(false);
  });

  it("rejects a missing schemaVersion / contentHash (legacy cache)", () => {
    const content = "本文";
    const legacy = makeCache(content, { schemaVersion: undefined, contentHash: undefined });
    expect(isWordCacheValid(legacy, META, content)).toBe(false);
  });

  it("rejects when disk mtime changed (secondary guard)", () => {
    const content = "本文";
    expect(isWordCacheValid(makeCache(content), { ...META, lastModified: 9999 }, content)).toBe(
      false,
    );
  });

  it("rejects when disk size changed (secondary guard)", () => {
    const content = "本文";
    expect(isWordCacheValid(makeCache(content), { ...META, size: 1 }, content)).toBe(false);
  });

  it("(d) same size + same mtime but DIFFERENT content invalidates", () => {
    // The whole point of #1890: disk meta is identical, content is not.
    const cache = makeCache("original content");
    expect(isWordCacheValid(cache, META, "tampered content")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end cache decisions over a fake VFS
// ---------------------------------------------------------------------------

/**
 * Minimal fake VFS modelling the exact read/write decisions WordFrequency makes.
 * Disk metadata only changes on save; the live `content` is supplied separately
 * (it may be dirty/ahead of disk).
 */
class FakeVFS {
  private cacheStore = new Map<string, string>();
  private meta: { lastModified: number; size: number };
  private analyzeCalls = 0;

  constructor(initialDiskContent: string) {
    this.meta = { lastModified: 1000, size: initialDiskContent.length };
  }

  /** Number of times analysis actually ran (cache miss path). */
  get analysisCount(): number {
    return this.analyzeCalls;
  }

  /** Simulate a save: disk metadata advances. */
  save(newDiskContent: string): void {
    this.meta = { lastModified: this.meta.lastModified + 1, size: newDiskContent.length };
  }

  private analyze(content: string): WordEntry[] {
    this.analyzeCalls++;
    // Toy "tokenizer": one entry per unique whitespace-delimited token.
    const counts = new Map<string, number>();
    for (const tok of content.split(/\s+/).filter(Boolean)) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
    return [...counts.entries()].map(([word, count]) => ({
      word,
      count,
      reading: "",
      pos: "名詞",
    }));
  }

  /**
   * Reproduce analyzeContent()'s cache read -> (miss) analyze -> write path.
   * Returns the words served plus whether they came from cache.
   */
  run(content: string, force = false): { words: WordEntry[]; fromCache: boolean } {
    const cachePath = "cache.json";

    if (!force && this.cacheStore.has(cachePath)) {
      const cache = JSON.parse(this.cacheStore.get(cachePath)!) as WordFrequencyCache;
      if (isWordCacheValid(cache, this.meta, content)) {
        return { words: cache.words, fromCache: true };
      }
    }

    const words = this.analyze(content);
    const cacheData: WordFrequencyCache = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      contentHash: hashContent(content),
      lastModified: this.meta.lastModified,
      fileSize: this.meta.size,
      words,
      totalWords: words.reduce((s, w) => s + w.count, 0),
      uniqueWords: words.length,
      analyzedAt: Date.now(),
    };
    this.cacheStore.set(cachePath, JSON.stringify(cacheData));
    return { words, fromCache: false };
  }
}

describe("WordFrequency cache flow (fake VFS)", () => {
  let vfs: FakeVFS;

  const wordsOf = (r: { words: WordEntry[] }): string[] => r.words.map((w) => w.word).sort();

  beforeEach(() => {
    vfs = new FakeVFS("alpha beta");
  });

  it("(a) cache -> unsaved edit adds a new word -> reflected (not stale cache)", () => {
    const first = vfs.run("alpha beta");
    expect(first.fromCache).toBe(false);

    // Same content again -> cache hit, no re-analysis.
    const repeat = vfs.run("alpha beta");
    expect(repeat.fromCache).toBe(true);

    // Unsaved edit adds a word; disk meta unchanged. Must NOT serve stale cache.
    const dirty = vfs.run("alpha beta gamma");
    expect(dirty.fromCache).toBe(false);
    expect(wordsOf(dirty)).toContain("gamma");
  });

  it("(b) unsaved edit -> save -> still reflected (re-analysis effect can re-run)", () => {
    vfs.run("alpha beta"); // seed cache for disk content

    // Unsaved edit -> reflected via cache miss.
    const dirty = vfs.run("alpha beta gamma");
    expect(dirty.fromCache).toBe(false);
    expect(wordsOf(dirty)).toContain("gamma");

    // Save the edit: disk meta advances, content unchanged.
    vfs.save("alpha beta gamma");

    // After save the same content should still reflect the edit. Because the
    // dirty pass wrote a cache keyed to the OLD disk meta, the post-save read
    // is a miss and re-analyzes — crucially it does NOT lose "gamma".
    const afterSave = vfs.run("alpha beta gamma");
    expect(wordsOf(afterSave)).toContain("gamma");
  });

  it("(c) dirty force-analysis -> discard -> next open shows DISK content stats", () => {
    vfs.run("alpha beta"); // disk-content cache

    // Force-analyze a dirty buffer (force bypasses read, then writes cache
    // tagged with the live content hash, NOT just disk meta).
    const forced = vfs.run("alpha beta gamma", true);
    expect(wordsOf(forced)).toContain("gamma");

    // User discards: live content reverts to the on-disk file. The cache
    // written during the dirty force-analysis must NOT be served, because its
    // contentHash is for the dirty buffer.
    const reverted = vfs.run("alpha beta");
    expect(reverted.fromCache).toBe(false);
    expect(wordsOf(reverted)).toEqual(["alpha", "beta"]);
    expect(wordsOf(reverted)).not.toContain("gamma");
  });

  it("(d) same mtime + same size but different content -> cache invalidated", () => {
    // Seed a cache, then craft a different content of identical byte length so
    // disk meta would falsely match under the old size/mtime-only check.
    vfs.run("aaaa");
    const sameLenDifferent = vfs.run("bbbb");
    expect(sameLenDifferent.fromCache).toBe(false);
    expect(wordsOf(sameLenDifferent)).toEqual(["bbbb"]);
  });
});
