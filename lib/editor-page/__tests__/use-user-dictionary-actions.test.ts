/**
 * Tests for useUserDictionaryActions — the quick "add to user dictionary"
 * action invoked from lint UI (#1962 quick-add). Verifies project/standalone
 * routing, word-level dedup, and the entry shape passed to the service.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import type { EditorMode, UserDictionaryEntry } from "@/lib/project/project-types";

const addEntry = vi.fn(async (_entry: UserDictionaryEntry) => [] as UserDictionaryEntry[]);
const addEntryStandalone = vi.fn(
  async (_fileName: string, _entry: UserDictionaryEntry) => [] as UserDictionaryEntry[],
);
const loadEntries = vi.fn(async () => [] as UserDictionaryEntry[]);
const loadEntriesStandalone = vi.fn(async (_fileName: string) => [] as UserDictionaryEntry[]);

vi.mock("@/lib/services/user-dictionary-service", () => ({
  getUserDictionaryService: () => ({
    addEntry,
    addEntryStandalone,
    loadEntries,
    loadEntriesStandalone,
  }),
}));

const info = vi.fn();
const success = vi.fn();
const error = vi.fn();
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: {
    info: (m: string) => info(m),
    success: (m: string) => success(m),
    error: (m: string) => error(m),
  },
}));

import { useUserDictionaryActions } from "../use-user-dictionary-actions";

const PROJECT_MODE = { type: "project" } as unknown as EditorMode;
const STANDALONE_MODE = {
  type: "standalone",
  fileName: "novel.mdi",
} as unknown as EditorMode;

// Minimal hook harness via createRoot + act (no @testing-library/react).
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function setup(mode: EditorMode): { addWordToUserDictionary: (word: string) => Promise<void> } {
  const capturedRef: { current: ReturnType<typeof useUserDictionaryActions> | null } = {
    current: null,
  };
  function Probe() {
    // Capture the hook return into an outer ref so the test can drive it.
    // Not a production render pattern.
    // eslint-disable-next-line react-hooks/immutability
    capturedRef.current = useUserDictionaryActions(mode);
    return null;
  }
  container = document.createElement("div");
  root = createRoot(container);
  act(() => {
    root!.render(React.createElement(Probe));
  });
  return capturedRef.current!;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadEntries.mockResolvedValue([]);
  loadEntriesStandalone.mockResolvedValue([]);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container = null;
});

describe("useUserDictionaryActions", () => {
  it("adds a word via addEntry in project mode with a generated id", async () => {
    const { addWordToUserDictionary } = setup(PROJECT_MODE);
    await addWordToUserDictionary("フガピヨ");

    expect(addEntry).toHaveBeenCalledTimes(1);
    const entry = addEntry.mock.calls[0][0] as UserDictionaryEntry;
    expect(entry.word).toBe("フガピヨ");
    expect(typeof entry.id).toBe("string");
    expect(entry.id.length).toBeGreaterThan(0);
    expect(addEntryStandalone).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalled();
  });

  it("adds a word via addEntryStandalone in standalone mode, keyed by fileName", async () => {
    const { addWordToUserDictionary } = setup(STANDALONE_MODE);
    await addWordToUserDictionary("フガピヨ");

    expect(addEntryStandalone).toHaveBeenCalledTimes(1);
    expect(addEntryStandalone.mock.calls[0][0]).toBe("novel.mdi");
    expect((addEntryStandalone.mock.calls[0][1] as UserDictionaryEntry).word).toBe("フガピヨ");
    expect(addEntry).not.toHaveBeenCalled();
  });

  it("skips when the word is already registered (project)", async () => {
    loadEntries.mockResolvedValue([{ id: "x", word: "フガピヨ" }]);
    const { addWordToUserDictionary } = setup(PROJECT_MODE);
    await addWordToUserDictionary("フガピヨ");

    expect(addEntry).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it("trims and ignores blank words", async () => {
    const { addWordToUserDictionary } = setup(PROJECT_MODE);
    await addWordToUserDictionary("   ");

    expect(loadEntries).not.toHaveBeenCalled();
    expect(addEntry).not.toHaveBeenCalled();
  });

  it("does nothing when there is no editor mode", async () => {
    const { addWordToUserDictionary } = setup(null);
    await addWordToUserDictionary("フガピヨ");

    expect(addEntry).not.toHaveBeenCalled();
    expect(addEntryStandalone).not.toHaveBeenCalled();
  });

  it("surfaces an error toast when the service throws", async () => {
    addEntry.mockRejectedValueOnce(new Error("disk full"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { addWordToUserDictionary } = setup(PROJECT_MODE);
    await addWordToUserDictionary("フガピヨ");

    expect(error).toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
});
