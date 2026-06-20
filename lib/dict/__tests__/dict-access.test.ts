import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DictLookup } from "../dict-types";

/**
 * Tests for the DictAccess facade (#1624): health resolution, batch lookup with
 * caching + negative caching, membership, web fallback, and invalidate().
 */

const mockLookupBatchRemote = vi.fn<(terms: string[]) => Promise<Map<string, DictLookup>>>();

vi.mock("../providers/genji-api-backend", () => ({
  lookupBatchRemote: (terms: string[]) => mockLookupBatchRemote(terms),
}));

interface DictApiMock {
  lookupBatch: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
}

function setElectronDict(dict: DictApiMock | null): void {
  const w = window as unknown as { electronAPI?: unknown };
  if (dict) {
    w.electronAPI = { dict };
  } else {
    delete w.electronAPI;
  }
}

async function importFresh() {
  const mod = await import("../dict-access");
  return mod.getDictAccess();
}

describe("DictAccess (#1624)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setElectronDict(null);
  });

  afterEach(() => {
    setElectronDict(null);
  });

  describe("getHealth()", () => {
    it("reports web-fallback when there is no Electron dict API", async () => {
      const access = await importFresh();
      const health = await access.getHealth();
      expect(health.state).toBe("web-fallback");
    });

    it("reports not-installed", async () => {
      setElectronDict({
        getStatus: vi.fn().mockResolvedValue({ status: "not-installed" }),
        verify: vi.fn(),
        lookupBatch: vi.fn(),
      });
      const access = await importFresh();
      expect((await access.getHealth()).state).toBe("not-installed");
    });

    it("reports corrupt when getStatus is corrupt", async () => {
      setElectronDict({
        getStatus: vi.fn().mockResolvedValue({ status: "corrupt", installedVersion: "v1" }),
        verify: vi.fn(),
        lookupBatch: vi.fn(),
      });
      const access = await importFresh();
      const health = await access.getHealth();
      expect(health.state).toBe("corrupt");
      expect(health.installedVersion).toBe("v1");
    });

    it("reports ready when installed and verify passes", async () => {
      const verify = vi.fn().mockResolvedValue({ ok: true });
      setElectronDict({
        getStatus: vi.fn().mockResolvedValue({ status: "installed", installedVersion: "v2" }),
        verify,
        lookupBatch: vi.fn(),
      });
      const access = await importFresh();
      const health = await access.getHealth();
      expect(health.state).toBe("ready");
      expect(verify).toHaveBeenCalledOnce();
    });

    it("reports corrupt when installed but verify fails", async () => {
      setElectronDict({
        getStatus: vi.fn().mockResolvedValue({ status: "installed", installedVersion: "v2" }),
        verify: vi.fn().mockResolvedValue({ ok: false, reason: "malformed" }),
        lookupBatch: vi.fn(),
      });
      const access = await importFresh();
      expect((await access.getHealth()).state).toBe("corrupt");
    });

    it("caches health within the TTL (one getStatus call across two reads)", async () => {
      const getStatus = vi.fn().mockResolvedValue({ status: "installed" });
      setElectronDict({
        getStatus,
        verify: vi.fn().mockResolvedValue({ ok: true }),
        lookupBatch: vi.fn(),
      });
      const access = await importFresh();
      await access.getHealth();
      await access.getHealth();
      expect(getStatus).toHaveBeenCalledOnce();
    });
  });

  describe("lookupBatch() — local Electron path", () => {
    it("projects hits, caches negatives, and returns an entry for every term", async () => {
      const lookupBatch = vi
        .fn()
        .mockResolvedValue([{ entry: "雪", found: true, reading: "ゆき", freqRank: 1200 }]);
      setElectronDict({
        lookupBatch,
        verify: vi.fn(),
        getStatus: vi.fn(),
      });
      const access = await importFresh();

      const result = await access.lookupBatch(["雪", "存在しない語"]);
      expect(result.get("雪")).toEqual({ found: true, reading: "ゆき", freqRank: 1200 });
      expect(result.get("存在しない語")).toEqual({ found: false });

      // Second call for the same terms is fully cache-served (no extra IPC).
      await access.lookupBatch(["雪", "存在しない語"]);
      expect(lookupBatch).toHaveBeenCalledOnce();
    });

    it("dedupes and ignores empty terms", async () => {
      const lookupBatch = vi.fn().mockResolvedValue([{ entry: "雪", found: true }]);
      setElectronDict({ lookupBatch, verify: vi.fn(), getStatus: vi.fn() });
      const access = await importFresh();

      await access.lookupBatch(["雪", "雪", ""]);
      expect(lookupBatch).toHaveBeenCalledWith(["雪"]);
    });

    it("does NOT record an I/O error as a miss (leaves terms unresolved, re-queries next time)", async () => {
      // A transient IPC failure must never become a cached `{ found: false }` —
      // otherwise the 辞書外語 lint rule would flag every word and the poisoned
      // negative would persist across keystrokes. Regression for the prewarm fix.
      const lookupBatch = vi
        .fn()
        .mockRejectedValueOnce(new Error("ipc boom"))
        .mockResolvedValueOnce([{ entry: "雪", found: true }]);
      setElectronDict({ lookupBatch, verify: vi.fn(), getStatus: vi.fn() });
      const access = await importFresh();

      // First call fails: the term must be ABSENT from the result, not `{found:false}`.
      const first = await access.lookupBatch(["雪"]);
      expect(first.has("雪")).toBe(false);

      // The failure was not cached, so a second call actually re-queries and resolves.
      const second = await access.lookupBatch(["雪"]);
      expect(second.get("雪")).toEqual({ found: true });
      expect(lookupBatch).toHaveBeenCalledTimes(2);
    });
  });

  describe("has()", () => {
    it("returns true for a known headword and false for an unknown one", async () => {
      setElectronDict({
        lookupBatch: vi.fn().mockResolvedValue([{ entry: "雪", found: true }]),
        verify: vi.fn(),
        getStatus: vi.fn(),
      });
      const access = await importFresh();
      expect(await access.has("雪")).toBe(true);
      expect(await access.has("存在しない語")).toBe(false);
      expect(await access.has("")).toBe(false);
    });
  });

  describe("lookupBatch() — web fallback", () => {
    it("uses the remote backend when there is no Electron dict", async () => {
      mockLookupBatchRemote.mockResolvedValue(
        new Map<string, DictLookup>([["雪", { found: true, reading: "ゆき" }]]),
      );
      const access = await importFresh();
      const result = await access.lookupBatch(["雪"]);
      expect(mockLookupBatchRemote).toHaveBeenCalledWith(["雪"]);
      expect(result.get("雪")).toEqual({ found: true, reading: "ゆき" });
    });
  });

  describe("invalidate()", () => {
    it("clears cached lookups so the next call re-queries", async () => {
      const lookupBatch = vi.fn().mockResolvedValue([{ entry: "雪", found: true }]);
      setElectronDict({ lookupBatch, verify: vi.fn(), getStatus: vi.fn() });
      const access = await importFresh();

      await access.lookupBatch(["雪"]);
      access.invalidate();
      await access.lookupBatch(["雪"]);
      expect(lookupBatch).toHaveBeenCalledTimes(2);
    });
  });
});
