/**
 * Unit tests for the rulesets-manager pure helpers and the official list.
 * Network/fs paths are not exercised here (they require live GitHub/disk); the
 * extracted pure helpers carry the version/compatibility/selection logic.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  selectReleaseAssets,
  isCompatibleEngineApi,
  needsUpdate,
  normalizeDigest,
  SUPPORTED_ENGINE_API,
} = require("../rulesets-manager") as {
  selectReleaseAssets: (assets: unknown) => { index: unknown; manifest: unknown };
  isCompatibleEngineApi: (m: unknown) => boolean;
  needsUpdate: (installed: string | null, latest: string | null) => boolean;
  normalizeDigest: (d: unknown) => string | null;
  SUPPORTED_ENGINE_API: number;
};

const { OFFICIAL_RULESETS } = require("../official-rulesets") as {
  OFFICIAL_RULESETS: ReadonlyArray<{ id: string; owner: string; repo: string }>;
};

describe("OFFICIAL_RULESETS", () => {
  it("every entry has id/owner/repo strings", () => {
    expect(OFFICIAL_RULESETS.length).toBeGreaterThan(0);
    for (const r of OFFICIAL_RULESETS) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.owner).toBe("string");
      expect(typeof r.repo).toBe("string");
    }
  });

  it("includes the 現代仮名遣い ruleset", () => {
    expect(OFFICIAL_RULESETS.some((r) => r.id === "com.illusions-lab.gendai-kanazukai")).toBe(true);
  });

  it("ids are unique", () => {
    const ids = OFFICIAL_RULESETS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("selectReleaseAssets", () => {
  it("picks index.js and manifest.json, ignoring other assets", () => {
    const { index, manifest } = selectReleaseAssets([
      { name: "manifest.json", browser_download_url: "u1" },
      { name: "index.js", browser_download_url: "u2" },
      { name: "com.example-v1.0.0.zip", browser_download_url: "u3" },
    ]) as { index: { name: string }; manifest: { name: string } };
    expect(index.name).toBe("index.js");
    expect(manifest.name).toBe("manifest.json");
  });

  it("returns null for a missing asset and tolerates non-arrays", () => {
    expect(selectReleaseAssets([{ name: "index.js" }]).manifest).toBeNull();
    expect(selectReleaseAssets(undefined)).toEqual({ index: null, manifest: null });
    expect(selectReleaseAssets(null)).toEqual({ index: null, manifest: null });
  });
});

describe("isCompatibleEngineApi", () => {
  it("accepts the supported engine api only", () => {
    expect(isCompatibleEngineApi({ engineApi: SUPPORTED_ENGINE_API })).toBe(true);
    expect(isCompatibleEngineApi({ engineApi: SUPPORTED_ENGINE_API + 1 })).toBe(false);
    expect(isCompatibleEngineApi({})).toBe(false);
    expect(isCompatibleEngineApi(null)).toBe(false);
  });
});

describe("needsUpdate", () => {
  it("downloads when not installed, skips when tags match", () => {
    expect(needsUpdate(null, "v1.0.0")).toBe(true);
    expect(needsUpdate("v1.0.0", "v1.0.0")).toBe(false);
    expect(needsUpdate("v1.0.0", "v1.1.0")).toBe(true);
  });

  it("does nothing when there is no latest tag", () => {
    expect(needsUpdate(null, null)).toBe(false);
    expect(needsUpdate("v1.0.0", null)).toBe(false);
  });
});

describe("normalizeDigest", () => {
  it("strips the sha256: prefix and lowercases", () => {
    expect(normalizeDigest("sha256:ABCDEF")).toBe("abcdef");
    expect(normalizeDigest("AbC123")).toBe("abc123");
  });

  it("returns null for non-strings or empty", () => {
    expect(normalizeDigest(undefined)).toBeNull();
    expect(normalizeDigest(123)).toBeNull();
    expect(normalizeDigest("sha256:")).toBeNull();
  });
});
