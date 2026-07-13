import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DictEntry } from "../../dict-types";

const SAMPLE_ENTRY: DictEntry = {
  id: "abc-123",
  entry: "雪",
  reading: { primary: "ゆき", alternatives: [] },
  partOfSpeech: "名詞",
  definitions: [{ gloss: "snow" }],
  relationships: { homophones: [], synonyms: [], antonyms: [], related: [] },
  source: "genji",
};

const SAMPLE_LOCAL_ENTRY: DictEntry = {
  ...SAMPLE_ENTRY,
  id: "local-123",
};

// Save original window state
const originalWindow = { ...globalThis.window };

function setupElectronEnv(installed: boolean, entries: DictEntry[] = []) {
  Object.defineProperty(globalThis, "window", {
    value: {
      ...originalWindow,
      process: { type: "renderer" },
      electronAPI: {
        dict: {
          query: vi.fn().mockResolvedValue(entries),
          queryByReading: vi.fn().mockResolvedValue(entries),
          getStatus: vi.fn().mockResolvedValue({
            status: installed ? "installed" : "not-installed",
          }),
        },
      },
    },
    writable: true,
    configurable: true,
  });
}

function setupWebEnv() {
  Object.defineProperty(globalThis, "window", {
    value: {
      ...originalWindow,
      process: undefined,
      electronAPI: undefined,
    },
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GenjiProvider", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  async function createProvider() {
    const { GenjiProvider } = await import("../genji-provider");
    return new GenjiProvider();
  }

  describe("isAvailable", () => {
    it("returns false in web environment", async () => {
      setupWebEnv();
      const provider = await createProvider();
      expect(await provider.isAvailable()).toBe(false);
    });

    it("returns true in Electron environment", async () => {
      setupElectronEnv(true);
      const provider = await createProvider();
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe("query — web environment", () => {
    it("returns no results without calling a remote backend", async () => {
      setupWebEnv();

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(results).toEqual([]);
    });
  });

  describe("query — Electron with installed dict", () => {
    it("uses local backend when results found", async () => {
      setupElectronEnv(true, [SAMPLE_LOCAL_ENTRY]);

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(results).toEqual([SAMPLE_LOCAL_ENTRY]);
    });
  });

  describe("query — Electron without installed dict", () => {
    it("returns no results", async () => {
      setupElectronEnv(false);

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(results).toEqual([]);
    });
  });

  describe("query — Electron local returns empty", () => {
    it("treats the installed local dict as authoritative and does NOT hit the network", async () => {
      // A zero-hit lookup in the installed local dict means "no such entry";
      // it must not fall through to any network backend.
      setupElectronEnv(true, []);

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(results).toEqual([]);
    });
  });

  describe("query — Electron local throws", () => {
    it("returns no results and does not call a remote backend", async () => {
      setupElectronEnv(true);
      // Override query to throw
      (
        window as Window & { electronAPI?: { dict?: { query: ReturnType<typeof vi.fn> } } }
      ).electronAPI!.dict!.query.mockRejectedValue(new Error("IPC failed"));

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(results).toEqual([]);
    });
  });

  describe("queryByReading — web environment", () => {
    it("returns no results without calling a remote backend", async () => {
      setupWebEnv();

      const provider = await createProvider();
      const results = await provider.queryByReading("ゆき");

      expect(results).toEqual([]);
    });
  });
});
