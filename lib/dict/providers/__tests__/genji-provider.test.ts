import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DictEntry } from "../../dict-types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQueryByEntry = vi.fn<(term: string, limit: number) => Promise<DictEntry[]>>();
const mockQueryByReading = vi.fn<(reading: string, limit: number) => Promise<DictEntry[]>>();

vi.mock("../genji-api-backend", () => ({
  queryByEntry: (...args: [string, number]) => mockQueryByEntry(...args),
  queryByReading: (...args: [string, number]) => mockQueryByReading(...args),
}));

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
    mockQueryByEntry.mockReset();
    mockQueryByReading.mockReset();
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
    it("returns true in web environment", async () => {
      setupWebEnv();
      const provider = await createProvider();
      expect(await provider.isAvailable()).toBe(true);
    });

    it("returns true in Electron environment", async () => {
      setupElectronEnv(true);
      const provider = await createProvider();
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe("query — web environment", () => {
    it("uses remote backend", async () => {
      setupWebEnv();
      mockQueryByEntry.mockResolvedValue([SAMPLE_ENTRY]);

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(mockQueryByEntry).toHaveBeenCalledWith("雪", 20);
      expect(results).toEqual([SAMPLE_ENTRY]);
    });
  });

  describe("query — Electron with installed dict", () => {
    it("uses local backend when results found", async () => {
      setupElectronEnv(true, [SAMPLE_LOCAL_ENTRY]);

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(results).toEqual([SAMPLE_LOCAL_ENTRY]);
      expect(mockQueryByEntry).not.toHaveBeenCalled();
    });
  });

  describe("query — Electron without installed dict", () => {
    it("falls back to remote backend", async () => {
      setupElectronEnv(false);
      mockQueryByEntry.mockResolvedValue([SAMPLE_ENTRY]);

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(mockQueryByEntry).toHaveBeenCalledWith("雪", 20);
      expect(results).toEqual([SAMPLE_ENTRY]);
    });
  });

  describe("query — Electron local returns empty", () => {
    it("falls back to remote when local returns empty", async () => {
      setupElectronEnv(true, []);
      mockQueryByEntry.mockResolvedValue([SAMPLE_ENTRY]);

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(mockQueryByEntry).toHaveBeenCalled();
      expect(results).toEqual([SAMPLE_ENTRY]);
    });
  });

  describe("query — Electron local throws", () => {
    it("falls back to remote on local error", async () => {
      setupElectronEnv(true);
      // Override query to throw
      (
        window as Window & { electronAPI?: { dict?: { query: ReturnType<typeof vi.fn> } } }
      ).electronAPI!.dict!.query.mockRejectedValue(new Error("IPC failed"));
      mockQueryByEntry.mockResolvedValue([SAMPLE_ENTRY]);

      const provider = await createProvider();
      const results = await provider.query("雪");

      expect(mockQueryByEntry).toHaveBeenCalled();
      expect(results).toEqual([SAMPLE_ENTRY]);
    });
  });

  describe("queryByReading — web environment", () => {
    it("uses remote backend", async () => {
      setupWebEnv();
      mockQueryByReading.mockResolvedValue([SAMPLE_ENTRY]);

      const provider = await createProvider();
      const results = await provider.queryByReading("ゆき");

      expect(mockQueryByReading).toHaveBeenCalledWith("ゆき", 20);
      expect(results).toEqual([SAMPLE_ENTRY]);
    });
  });
});
