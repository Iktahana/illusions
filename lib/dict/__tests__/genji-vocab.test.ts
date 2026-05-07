import { describe, it, expect, beforeEach, vi } from "vitest";

// Ensure the runtime-env helper treats the test environment as Electron.
vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => true,
}));

import { genjiVocab } from "../genji-vocab";

type ListHeadwordsFn = () => Promise<string[]>;

function stubElectronAPI(listNounHeadwords: ListHeadwordsFn | undefined): void {
  const api = listNounHeadwords ? { dict: { listNounHeadwords } } : { dict: {} };
  (globalThis as unknown as { window: unknown }).window = Object.assign(globalThis.window ?? {}, {
    electronAPI: { isElectron: true, ...api },
  });
}

function resetVocab(): void {
  // Reach into the singleton to reset between tests.
  const internal = genjiVocab as unknown as {
    headwords: Set<string>;
    state: "idle" | "loading" | "ready" | "unavailable";
    loadPromise: Promise<void> | null;
    listeners: Set<() => void>;
  };
  internal.headwords = new Set();
  internal.state = "idle";
  internal.loadPromise = null;
  internal.listeners = new Set();
}

describe("GenjiVocab", () => {
  beforeEach(() => {
    resetVocab();
    stubElectronAPI(undefined);
  });

  it("becomes unavailable when the IPC surface is missing", async () => {
    stubElectronAPI(undefined);
    await genjiVocab.initialize();
    expect(genjiVocab.isReady()).toBe(false);
    expect(genjiVocab.getState()).toBe("unavailable");
  });

  it("loads headwords and reports ready", async () => {
    stubElectronAPI(async () => ["光君", "紫の上", "源氏"]);
    await genjiVocab.initialize();
    expect(genjiVocab.isReady()).toBe(true);
    expect(genjiVocab.has("光君")).toBe(true);
    expect(genjiVocab.has("紫の上")).toBe(true);
    expect(genjiVocab.has("unknown")).toBe(false);
  });

  it("treats empty headword list as unavailable", async () => {
    stubElectronAPI(async () => []);
    await genjiVocab.initialize();
    expect(genjiVocab.isReady()).toBe(false);
    expect(genjiVocab.getState()).toBe("unavailable");
  });

  it("is idempotent — concurrent initialize calls share one load", async () => {
    let calls = 0;
    stubElectronAPI(async () => {
      calls++;
      return ["源氏"];
    });
    await Promise.all([genjiVocab.initialize(), genjiVocab.initialize(), genjiVocab.initialize()]);
    expect(calls).toBe(1);
    expect(genjiVocab.has("源氏")).toBe(true);
  });

  it("reload pulls fresh data", async () => {
    let payload: string[] = ["光君"];
    stubElectronAPI(async () => payload);
    await genjiVocab.initialize();
    expect(genjiVocab.has("光君")).toBe(true);

    payload = ["紫の上"];
    await genjiVocab.reload();
    expect(genjiVocab.has("光君")).toBe(false);
    expect(genjiVocab.has("紫の上")).toBe(true);
  });

  it("notifies subscribers on state change and allows unsubscribe", async () => {
    stubElectronAPI(async () => ["源氏"]);
    const cb = vi.fn();
    const off = genjiVocab.subscribe(cb);
    await genjiVocab.initialize();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    await genjiVocab.reload();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("falls back to unavailable if IPC throws", async () => {
    stubElectronAPI(async () => {
      throw new Error("IPC broken");
    });
    await genjiVocab.initialize();
    expect(genjiVocab.getState()).toBe("unavailable");
    expect(genjiVocab.has("anything")).toBe(false);
  });
});
