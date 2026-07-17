/**
 * Tests for the persisted standalone-opened-paths allowlist (#1965).
 *
 * This is the security boundary for session restore of file-backed standalone
 * tabs: only paths the user actually opened (recorded here) may be re-read by
 * the `read-standalone-file` IPC.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsSync, { promises as fs } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// CommonJS module under test.
import {
  loadStandalonePaths,
  hasStandalonePath,
  addStandalonePath,
  clearStandalonePathsCache,
  MAX_STANDALONE_PATHS,
} from "../standalone-files";

let dir: string;
let file: string;

beforeEach(async () => {
  clearStandalonePathsCache();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "standalone-files-"));
  file = path.join(dir, "approved-standalone-paths.json");
});

afterEach(async () => {
  clearStandalonePathsCache();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("standalone-files (#1965 persisted allowlist)", () => {
  it("returns empty set / false when the file does not exist", async () => {
    expect(await loadStandalonePaths(file)).toEqual(new Set());
    expect(await hasStandalonePath(file, "/abs/never.mdi")).toBe(false);
  });

  it("records a path and reports membership after a fresh process (cache cleared)", async () => {
    await addStandalonePath(file, "/abs/novel.mdi");
    clearStandalonePathsCache(); // simulate restart: forget in-memory cache
    expect(await hasStandalonePath(file, "/abs/novel.mdi")).toBe(true);
    expect(await loadStandalonePaths(file)).toEqual(new Set(["/abs/novel.mdi"]));
  });

  it("persists to disk in the documented schema", async () => {
    await addStandalonePath(file, "/abs/a.mdi");
    const raw = JSON.parse(await fs.readFile(file, "utf-8"));
    expect(raw.version).toBe(1);
    expect(Array.isArray(raw.paths)).toBe(true);
    expect(raw.paths[0].path).toBe("/abs/a.mdi");
    expect(typeof raw.paths[0].openedAt).toBe("string");
  });

  it("is idempotent and does not duplicate an existing path", async () => {
    await addStandalonePath(file, "/abs/a.mdi");
    await addStandalonePath(file, "/abs/a.mdi");
    const set = await loadStandalonePaths(file);
    expect(set.size).toBe(1);
  });

  it("rejects non-approved paths (fail closed)", async () => {
    await addStandalonePath(file, "/abs/a.mdi");
    expect(await hasStandalonePath(file, "/abs/other.mdi")).toBe(false);
    expect(await hasStandalonePath(file, "")).toBe(false);
    // @ts-expect-error — defensive: non-string input
    expect(await hasStandalonePath(file, null)).toBe(false);
  });

  it("evicts oldest entries past the cap", async () => {
    for (let i = 0; i < MAX_STANDALONE_PATHS + 5; i++) {
      await addStandalonePath(file, `/abs/file-${i}.mdi`);
    }
    const set = await loadStandalonePaths(file);
    expect(set.size).toBe(MAX_STANDALONE_PATHS);
    // The 5 oldest should have been evicted; the newest must remain.
    expect(set.has("/abs/file-0.mdi")).toBe(false);
    expect(set.has(`/abs/file-${MAX_STANDALONE_PATHS + 4}.mdi`)).toBe(true);
  });

  it("tolerates a corrupt JSON file (treats as empty)", async () => {
    await fs.writeFile(file, "{ not valid json", "utf-8");
    clearStandalonePathsCache();
    expect(await loadStandalonePaths(file)).toEqual(new Set());
    // ...and can still record new paths afterwards.
    await addStandalonePath(file, "/abs/recovered.mdi");
    clearStandalonePathsCache();
    expect(await hasStandalonePath(file, "/abs/recovered.mdi")).toBe(true);
  });

  it("drops malformed entries on load", async () => {
    await fs.writeFile(
      file,
      JSON.stringify({ version: 1, paths: [{ path: "/abs/ok.mdi" }, { nope: true }, null, 42] }),
      "utf-8",
    );
    clearStandalonePathsCache();
    expect(await loadStandalonePaths(file)).toEqual(new Set(["/abs/ok.mdi"]));
  });

  it("persists via the shared atomic writer (#2146)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = fsSync.readFileSync(path.resolve(here, "../standalone-files.js"), "utf-8");
    expect(source).toContain("writeUtf8FileAtomically");
    expect(source).not.toMatch(/fs\.writeFile\(/);
  });
});
