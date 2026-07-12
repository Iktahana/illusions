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
  extractTagFromLocation,
  isSafeRulesetId,
  SUPPORTED_ENGINE_API,
} = require("../rulesets-manager") as {
  selectReleaseAssets: (assets: unknown) => { index: unknown; manifest: unknown };
  isCompatibleEngineApi: (m: unknown) => boolean;
  needsUpdate: (installed: string | null, latest: string | null) => boolean;
  normalizeDigest: (d: unknown) => string | null;
  extractTagFromLocation: (location: unknown) => string | null;
  isSafeRulesetId: (id: unknown) => boolean;
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

describe("extractTagFromLocation", () => {
  it("reads the tag from a github releases/latest 302 Location", () => {
    expect(
      extractTagFromLocation(
        "https://github.com/illusions-lab/illusions-ruleset-gendai-kanazukai/releases/tag/v0.3.0",
      ),
    ).toBe("v0.3.0");
  });

  it("handles relative locations and percent-encoded tags", () => {
    expect(extractTagFromLocation("/owner/repo/releases/tag/v1.2.3")).toBe("v1.2.3");
    expect(extractTagFromLocation("/o/r/releases/tag/v1%2E0%2E0?x=1")).toBe("v1.0.0");
  });

  it("returns null for non-tag locations or non-strings", () => {
    expect(extractTagFromLocation("https://github.com/o/r/releases")).toBeNull();
    expect(extractTagFromLocation(undefined)).toBeNull();
    expect(extractTagFromLocation(null)).toBeNull();
    expect(extractTagFromLocation(123)).toBeNull();
  });
});

describe("isSafeRulesetId", () => {
  it("accepts dotted/hyphenated ids", () => {
    expect(isSafeRulesetId("com.illusions-lab.gendai-kanazukai")).toBe(true);
    expect(isSafeRulesetId("my_team.rules-1")).toBe(true);
  });
  it("rejects path traversal and separators", () => {
    expect(isSafeRulesetId("../etc/passwd")).toBe(false);
    expect(isSafeRulesetId("a/b")).toBe(false);
    expect(isSafeRulesetId("a\\b")).toBe(false);
    expect(isSafeRulesetId("a..b")).toBe(false);
    expect(isSafeRulesetId("")).toBe(false);
    expect(isSafeRulesetId(123)).toBe(false);
  });
});

// --- readModule / uninstall against an isolated HOME (real fs) ---
const fs = require("fs") as typeof import("fs");
const os = require("os") as typeof import("os");
const path = require("path") as typeof import("path");
const crypto = require("crypto") as typeof import("crypto");

const { RulesetsManager, isSafeRulesetId: _safe } = require("../rulesets-manager") as {
  RulesetsManager: new () => {
    readModule: (
      id: string,
    ) => Promise<
      | { ok: true; id: string; tag: string | null; manifest: unknown; code: string }
      | { ok: false; id: string; reason: string }
    >;
    uninstall: (id: string) => { ok: boolean; detail?: string };
    listInstalled: () => Array<{ id: string; version: string | null; tag: string | null }>;
  };
  isSafeRulesetId: (id: unknown) => boolean;
};
void _safe;

/** Lay down a complete installed ruleset under <home>/.illusions/rulesets/<id>/. */
function installFake(home: string, id: string, code: string, tag = "v1.0.0"): void {
  const dir = path.join(home, ".illusions", "rulesets", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ id, version: "1.0.0" }));
  fs.writeFileSync(path.join(dir, "index.js"), code);
  fs.writeFileSync(path.join(dir, ".release-tag"), tag);
  const sha = crypto.createHash("sha256").update(Buffer.from(code, "utf8")).digest("hex");
  fs.writeFileSync(path.join(dir, "index.js.sha256"), sha);
}

describe("RulesetsManager.readModule / uninstall (isolated HOME)", () => {
  it("reads a complete install, verifies integrity, and rejects tamper/traversal", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "illusions-rm-"));
    const prev = process.env.HOME;
    const prevUserProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const mgr = new RulesetsManager();
      const id = "com.example.thirdparty";
      installFake(home, id, "export default { manifest:{}, createRules(){return[]} };");

      const ok = await mgr.readModule(id);
      expect(ok.ok).toBe(true);
      if (ok.ok) {
        expect(ok.code).toContain("createRules");
        expect(ok.tag).toBe("v1.0.0");
      }

      // tamper the code → integrity must fail
      fs.writeFileSync(
        path.join(home, ".illusions", "rulesets", id, "index.js"),
        "export default { hacked: true };",
      );
      const bad = await mgr.readModule(id);
      expect(bad.ok).toBe(false);

      // path traversal rejected up front
      expect((await mgr.readModule("../../etc/passwd")).ok).toBe(false);
      // missing install
      expect((await mgr.readModule("com.example.missing")).ok).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      if (prev === undefined) delete process.env.HOME;
      else process.env.HOME = prev;
      if (prevUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = prevUserProfile;
    }
  });

  it("uninstalls a third-party ruleset but refuses official ones", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "illusions-rm-"));
    const prev = process.env.HOME;
    const prevUserProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const mgr = new RulesetsManager();
      const tp = "com.example.thirdparty";
      installFake(home, tp, "export default {};");
      // official (built-in recommended) id is non-deletable
      const official = OFFICIAL_RULESETS[0]?.id ?? "com.illusions-lab.gendai-kanazukai";
      installFake(home, official, "export default {};");

      const refuse = mgr.uninstall(official);
      expect(refuse.ok).toBe(false);
      expect(fs.existsSync(path.join(home, ".illusions", "rulesets", official))).toBe(true);

      const removed = mgr.uninstall(tp);
      expect(removed.ok).toBe(true);
      expect(fs.existsSync(path.join(home, ".illusions", "rulesets", tp))).toBe(false);

      expect(mgr.uninstall("../../etc").ok).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      if (prev === undefined) delete process.env.HOME;
      else process.env.HOME = prev;
      if (prevUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = prevUserProfile;
    }
  });
});
