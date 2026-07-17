/**
 * Rulesets manager — main process.
 *
 * Auto-downloads official校正ルールセット (electron/official-rulesets.js) from
 * their GitHub Releases into `~/.illusions/rulesets/<id>/` so they are present
 * for the (future) external ruleset loader. Mirrors the dictionary downloader
 * (electron/dict-manager.js): GitHub Releases API, https-only with redirect
 * handling, host allowlist, sha256 verification, atomic install, fail-safe.
 *
 * Fail-safe: a failure for one ruleset (offline, no release, bad checksum,
 * incompatible engineApi) never throws to callers and never blocks the others
 * or app startup — it is logged and skipped.
 *
 * NOTE: downloading only places files on disk. They become active校正ルール only
 * once the external ruleset loader (worker Blob import) is wired up. This module
 * is intentionally independent of that loader.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const { pipeline } = require("stream");

const { OFFICIAL_RULESETS } = require("./official-rulesets");
const { withTransientIoRetrySync } = require("./lib/transient-io-retry");

function rmSyncWithRetry(target, options) {
  return withTransientIoRetrySync(() => fs.rmSync(target, options));
}

function renameSyncWithRetry(oldPath, newPath) {
  return withTransientIoRetrySync(() => fs.renameSync(oldPath, newPath));
}

// Mirrors ENGINE_API_VERSION in lib/linting/sdk/ruleset-types.ts. A downloaded
// ruleset whose manifest targets a different engine is skipped (incompatible).
const SUPPORTED_ENGINE_API = 1;

const ASSET_INDEX = "index.js";
const ASSET_MANIFEST = "manifest.json";
const VERSION_FILE = ".release-tag";
// sha256 (hex) of index.js, recorded at install time. The external loader
// re-verifies the code against this before executing it (closes the
// time-of-check/time-of-use gap between download and load).
const INTEGRITY_FILE = "index.js.sha256";

// Hosts GitHub serves release assets / API from. Asset URLs not on this list
// are rejected (defense against a tampered/redirected download target).
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

const MAX_ASSET_BYTES = 5 * 1024 * 1024; // 5 MB cap per asset (rulesets are tiny)
const REQUEST_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no I/O).
// ---------------------------------------------------------------------------

/**
 * Pick the index.js / manifest.json assets from a GitHub release's asset list.
 * @returns {{ index: object|null, manifest: object|null }}
 */
function selectReleaseAssets(assets) {
  const list = Array.isArray(assets) ? assets : [];
  return {
    index: list.find((a) => a && a.name === ASSET_INDEX) ?? null,
    manifest: list.find((a) => a && a.name === ASSET_MANIFEST) ?? null,
  };
}

/** True when a parsed manifest targets the supported engine API. */
function isCompatibleEngineApi(manifest) {
  return !!manifest && manifest.engineApi === SUPPORTED_ENGINE_API;
}

/** True when the latest release tag differs from what is installed. */
function needsUpdate(installedTag, latestTag) {
  if (!latestTag) return false;
  return !installedTag || installedTag !== latestTag;
}

/** Normalize a GitHub `digest` ("sha256:abc…") to a bare lowercase hex string. */
function normalizeDigest(digest) {
  if (typeof digest !== "string") return null;
  return digest.replace(/^sha256:/i, "").toLowerCase() || null;
}

/**
 * Extract a release tag from a GitHub `Location` redirect header.
 *
 * GET github.com/<owner>/<repo>/releases/latest answers with a 302 whose
 * Location is `.../releases/tag/<tag>`. Reading the tag from that header lets us
 * resolve the latest release WITHOUT the GitHub REST API (api.github.com), whose
 * unauthenticated 60-requests/hour limit was tripping a 403 every few clicks of
 * 「更新を確認」/「再ダウンロード」(each fans out to all official rulesets).
 * @returns {string|null} the tag, or null when the header isn't a /tag/ URL.
 */
function extractTagFromLocation(location) {
  if (typeof location !== "string") return null;
  const m = location.match(/\/releases\/tag\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Whether a ruleset id is safe to use as a directory name (no path traversal).
 * Ruleset ids look like "com.illusions-lab.gendai-kanazukai".
 */
function isSafeRulesetId(id) {
  return (
    typeof id === "string" && id.length > 0 && /^[A-Za-z0-9._-]+$/.test(id) && !id.includes("..")
  );
}

class RulesetsManager {
  constructor() {
    this._syncing = false;
  }

  /** Root directory for external/official rulesets: ~/.illusions/rulesets/ */
  _rootDir() {
    return path.join(os.homedir(), ".illusions", "rulesets");
  }

  _rulesetDir(id) {
    return path.join(this._rootDir(), id);
  }

  _isAllowedAssetUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname);
    } catch {
      return false;
    }
  }

  /** Read the installed release tag for an id, or null. */
  _readInstalledTag(id) {
    try {
      return fs.readFileSync(path.join(this._rulesetDir(id), VERSION_FILE), "utf8").trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * True when the installed dir has all required files (manifest + code + the
   * integrity sha). A pre-integrity install (no sha file) counts as INCOMPLETE
   * so the next sync re-installs it and records the sha (enables load-time
   * re-verification for installs made before integrity tracking existed).
   */
  _isInstalledComplete(id) {
    const dir = this._rulesetDir(id);
    return (
      fs.existsSync(path.join(dir, ASSET_MANIFEST)) &&
      fs.existsSync(path.join(dir, ASSET_INDEX)) &&
      fs.existsSync(path.join(dir, INTEGRITY_FILE))
    );
  }

  /** True when a directory holds a full release (manifest + code + tag + integrity). */
  _dirHasFullRelease(d) {
    return (
      fs.existsSync(path.join(d, ASSET_MANIFEST)) &&
      fs.existsSync(path.join(d, ASSET_INDEX)) &&
      fs.existsSync(path.join(d, VERSION_FILE)) &&
      fs.existsSync(path.join(d, INTEGRITY_FILE))
    );
  }

  /**
   * Recover from a crash mid-swap, with NO network access (heals even offline):
   * if the install is missing/incomplete but a COMPLETE copy survives in staging
   * or in the backup dir, promote it. Then discard any transient leftovers.
   */
  _recoverStaging(id, dir, staging) {
    const backup = `${dir}.backup`;
    try {
      if (!this._isInstalledComplete(id)) {
        for (const src of [staging, backup]) {
          if (this._dirHasFullRelease(src)) {
            rmSyncWithRetry(dir, { recursive: true, force: true });
            fs.mkdirSync(path.dirname(dir), { recursive: true });
            renameSyncWithRetry(src, dir);
            console.log(
              `[Rulesets] recovered ${src === staging ? "staged" : "backup"} install for ${id}`,
            );
            break;
          }
        }
      }
      // Drop any leftover transient dirs (already-consumed ones rm to no-ops).
      rmSyncWithRetry(staging, { recursive: true, force: true });
      rmSyncWithRetry(backup, { recursive: true, force: true });
    } catch {
      /* best-effort recovery — never throws */
    }
  }

  /**
   * List installed rulesets (those with both manifest.json and index.js).
   * @returns {Array<{ id: string, version: string|null, tag: string|null }>}
   */
  listInstalled() {
    const root = this._rootDir();
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return []; // root not created yet
    }
    const out = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith(".")) continue; // skip .staging-* and other hidden dirs
      const dir = path.join(root, ent.name);
      const manifestPath = path.join(dir, ASSET_MANIFEST);
      const indexPath = path.join(dir, ASSET_INDEX);
      if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) continue;
      let version = null;
      let id = ent.name;
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (m && typeof m.version === "string") version = m.version;
        if (m && typeof m.id === "string") id = m.id;
      } catch {
        // keep dir name as id, version null
      }
      out.push({ id, version, tag: this._readInstalledTag(ent.name) });
    }
    return out;
  }

  /**
   * Resolve the latest release tag for a spec WITHOUT the GitHub REST API.
   *
   * Sends a single GET to github.com/<owner>/<repo>/releases/latest and reads
   * the tag out of the 302 `Location` header (`.../releases/tag/<tag>`). This
   * avoids api.github.com's unauthenticated 60-req/hour limit, which previously
   * surfaced as a 403 after a handful of 「更新を確認」/「再ダウンロード」clicks
   * (each iterates every official ruleset). github.com release URLs are not
   * subject to that limit.
   *
   * Resolves `null` when the repo has no published release (404) or the redirect
   * isn't a tag URL. Does NOT follow the redirect (https.get returns the 302).
   * @param {{owner:string, repo:string}} spec
   * @returns {Promise<string|null>}
   */
  _resolveLatestTag(spec) {
    const url = `https://github.com/${spec.owner}/${spec.repo}/releases/latest`;
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        { headers: { "User-Agent": "illusions-app", Accept: "text/html" } },
        (res) => {
          res.on("error", reject);
          const code = res.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(code)) {
            const tag = extractTagFromLocation(res.headers.location);
            res.resume();
            resolve(tag);
            return;
          }
          // No releases yet → GitHub serves a 404 for /releases/latest.
          if (code === 404) {
            res.resume();
            resolve(null);
            return;
          }
          res.resume();
          reject(new Error(`GitHub が HTTP ${code} を返しました`));
        },
      );
      req.on("error", reject);
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error("GitHub リクエストがタイムアウトしました"));
      });
    });
  }

  /**
   * Check the latest release tag vs installed, without downloading.
   * @returns {Array<{ id, installedTag, latestTag, updateAvailable, hasRelease }>}
   */
  async checkUpdate() {
    const results = [];
    for (const spec of OFFICIAL_RULESETS) {
      try {
        const latestTag = await this._resolveLatestTag(spec);
        // We no longer enumerate the release's asset list (that needs the API);
        // a published tag implies the conventional index.js + manifest.json
        // assets. A genuinely asset-less release fails later at download time.
        const hasRelease = !!latestTag;
        const installedTag = this._readInstalledTag(spec.id);
        results.push({
          id: spec.id,
          installedTag,
          latestTag,
          hasRelease,
          updateAvailable: hasRelease && needsUpdate(installedTag, latestTag),
        });
      } catch (err) {
        results.push({ id: spec.id, error: String(err?.message ?? err) });
      }
    }
    return results;
  }

  /**
   * Download + install every official ruleset that is missing or out of date.
   * Best-effort and fail-safe: never throws; returns a per-ruleset summary.
   * @returns {Array<{ id, status: "installed"|"up-to-date"|"skipped"|"error", detail?: string }>}
   */
  async syncAllOfficial(onProgress) {
    if (this._syncing) return [{ id: "*", status: "skipped", detail: "sync already running" }];
    this._syncing = true;
    const summary = [];
    const report = (result) => {
      summary.push(result);
      if (typeof onProgress === "function") {
        try {
          onProgress(result);
        } catch {
          /* progress callback must never break the sync */
        }
      }
    };
    try {
      for (const spec of OFFICIAL_RULESETS) {
        try {
          report(await this._syncOne(spec));
        } catch (err) {
          console.warn(`[Rulesets] sync failed for ${spec.id}:`, err);
          report({ id: spec.id, status: "error", detail: String(err?.message ?? err) });
        }
      }
    } finally {
      this._syncing = false;
    }
    return summary;
  }

  /**
   * Read an installed ruleset's module code + manifest for the external loader.
   * Re-verifies the code against the sha recorded at install (TOCTOU defense)
   * and rejects path-traversal ids. Fail-safe: returns {ok:false} on any problem.
   * @param {string} id
   * @returns {Promise<{ok:true,id:string,tag:string|null,manifest:unknown,code:string}|{ok:false,id:string,reason:string}>}
   */
  async readModule(id) {
    if (!isSafeRulesetId(id)) return { ok: false, id: String(id), reason: "invalid id" };
    try {
      const dir = this._rulesetDir(id);
      if (!this._isInstalledComplete(id)) return { ok: false, id, reason: "not installed" };
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(dir, ASSET_MANIFEST), "utf8"));
      } catch {
        return { ok: false, id, reason: "manifest.json が不正なJSONです" };
      }
      // Hash the RAW bytes (matches what _downloadFile recorded).
      const buf = fs.readFileSync(path.join(dir, ASSET_INDEX));
      const actual = crypto.createHash("sha256").update(buf).digest("hex");
      const expected = fs.readFileSync(path.join(dir, INTEGRITY_FILE), "utf8").trim().toLowerCase();
      if (!expected || actual !== expected) {
        return {
          ok: false,
          id,
          reason: "整合性チェックに失敗しました（再ダウンロードが必要です）",
        };
      }
      return {
        ok: true,
        id,
        tag: this._readInstalledTag(id),
        manifest,
        code: buf.toString("utf8"),
      };
    } catch (err) {
      return { ok: false, id, reason: String(err?.message ?? err) };
    }
  }

  /**
   * Uninstall a third-party ruleset. Official (built-in recommended) rulesets
   * listed in OFFICIAL_RULESETS are NON-deletable and rejected here, so the
   * "削除不可" guarantee is enforced in the backend, not just the UI.
   * @param {string} id
   * @returns {{ok:boolean, detail?:string}}
   */
  uninstall(id) {
    if (!isSafeRulesetId(id)) return { ok: false, detail: "invalid id" };
    if (OFFICIAL_RULESETS.some((r) => r.id === id)) {
      return { ok: false, detail: "公式（内蔵推奨）ルールセットは削除できません。" };
    }
    try {
      const dir = this._rulesetDir(id);
      rmSyncWithRetry(dir, { recursive: true, force: true });
      rmSyncWithRetry(`${dir}.backup`, { recursive: true, force: true });
      rmSyncWithRetry(path.join(this._rootDir(), `.staging-${id}`), {
        recursive: true,
        force: true,
      });
      console.log(`[Rulesets] uninstalled ${id}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: String(err?.message ?? err) };
    }
  }

  /**
   * Sync a single official ruleset. MUST be called under the syncAllOfficial
   * `_syncing` guard (the only call paths serialize through it), so its use of a
   * stable per-id staging dir cannot race a concurrent sync of the same id.
   */
  async _syncOne(spec) {
    const dir = this._rulesetDir(spec.id);
    // Stage the FULL release in a sibling dir, then swap it in with a single
    // rename. The final dir is therefore only ever the old complete version,
    // briefly absent, or the new complete version — never a half-written pair
    // (e.g. new manifest + old code). Staging dirs use a "." prefix so
    // listInstalled() skips them.
    const staging = path.join(this._rootDir(), `.staging-${spec.id}`);

    // Heal a crash that interrupted a previous swap before doing any network I/O.
    this._recoverStaging(spec.id, dir, staging);

    const latestTag = await this._resolveLatestTag(spec);

    if (!latestTag) {
      return { id: spec.id, status: "skipped", detail: "no installable release" };
    }

    const installedTag = this._readInstalledTag(spec.id);
    // Re-install when the tag differs OR the on-disk bundle is incomplete — a
    // surviving .release-tag must not mask a missing/corrupt asset file.
    if (!needsUpdate(installedTag, latestTag) && this._isInstalledComplete(spec.id)) {
      return { id: spec.id, status: "up-to-date", detail: latestTag };
    }

    // Build asset URLs from the tag instead of the API's browser_download_url.
    // github.com/<o>/<r>/releases/download/<tag>/<asset> redirects to
    // objects.githubusercontent.com (an allowed host) and avoids the API limit.
    const base = `https://github.com/${spec.owner}/${spec.repo}/releases/download/${encodeURIComponent(latestTag)}`;
    const manifestUrl = `${base}/${ASSET_MANIFEST}`;
    const indexUrl = `${base}/${ASSET_INDEX}`;
    if (!this._isAllowedAssetUrl(indexUrl) || !this._isAllowedAssetUrl(manifestUrl)) {
      return { id: spec.id, status: "skipped", detail: "asset host not allowed" };
    }

    try {
      rmSyncWithRetry(staging, { recursive: true, force: true });
      fs.mkdirSync(staging, { recursive: true });

      // 1. manifest first — validate engineApi before fetching code.
      //    No API-provided digest to pre-check (we resolve assets by tag, not
      //    via the REST API). Integrity is still guaranteed by the sha256 we
      //    compute while streaming the code asset below and re-verify at load.
      await this._downloadFile(manifestUrl, path.join(staging, ASSET_MANIFEST), null);
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(staging, ASSET_MANIFEST), "utf8"));
      } catch {
        throw new Error("manifest.json が不正なJSONです");
      }
      if (!isCompatibleEngineApi(manifest)) {
        return {
          id: spec.id,
          status: "skipped",
          detail: `engineApi ${manifest?.engineApi} 非対応（要 ${SUPPORTED_ENGINE_API}）`,
        };
      }

      // 2. code asset. _downloadFile resolves with the sha256 it computed while
      //    streaming, which we persist for load-time re-verification.
      const indexHash = await this._downloadFile(indexUrl, path.join(staging, ASSET_INDEX), null);

      // 3. record the tag + integrity sha inside staging, then swap it in WITHOUT
      //    destroying the old install first: rename old→backup, staging→dir, then
      //    drop backup. A failed rename restores the backup, so we can never lose
      //    both copies; a crash mid-swap is healed by _recoverStaging() next run.
      fs.writeFileSync(path.join(staging, VERSION_FILE), latestTag, "utf8");
      fs.writeFileSync(path.join(staging, INTEGRITY_FILE), indexHash, "utf8");
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      const backup = `${dir}.backup`;
      rmSyncWithRetry(backup, { recursive: true, force: true });
      const hadOld = fs.existsSync(dir);
      if (hadOld) renameSyncWithRetry(dir, backup);
      try {
        renameSyncWithRetry(staging, dir);
      } catch (err) {
        if (hadOld) {
          try {
            rmSyncWithRetry(dir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
          renameSyncWithRetry(backup, dir); // restore the old install
        }
        throw err;
      }
      rmSyncWithRetry(backup, { recursive: true, force: true });

      console.log(`[Rulesets] installed ${spec.id} ${latestTag}`);
      return { id: spec.id, status: "installed", detail: latestTag };
    } finally {
      // Remove staging if the swap did not consume it (error / skip path).
      try {
        rmSyncWithRetry(staging, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  /**
   * Download a URL to destPath (https only, redirects, size cap). When
   * expectedDigest (sha256 hex) is provided, verify it and reject on mismatch.
   */
  _downloadFile(url, destPath, expectedDigest) {
    return new Promise((resolve, reject) => {
      // Operation-wide guards (span all redirect hops):
      // - `settled` makes resolve/reject fire exactly once.
      // - `piping` flips true once a 200 body is being piped; from then on the
      //   ONLY settlement path is the pipeline callback (which fires after both
      //   streams close), so cleanup never races an open fd — including when a
      //   stale earlier hop's request/timeout errors after we've moved on.
      let settled = false;
      let piping = false;
      const fail = (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      const succeed = (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          fail(new Error("ダウンロードのリダイレクトが最大回数を超えました"));
          return;
        }
        let parsed;
        try {
          parsed = new URL(requestUrl);
        } catch {
          fail(new Error("ダウンロードURLの形式が不正です"));
          return;
        }
        if (parsed.protocol !== "https:") {
          fail(new Error("https 以外のダウンロード先は許可されていません"));
          return;
        }
        // Re-validate the host on EVERY hop (including redirects), so a redirect
        // can never steer the download to a host outside the allowlist.
        if (!ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) {
          fail(new Error("ダウンロード先のホストが許可されていません"));
          return;
        }
        const req = https.get(requestUrl, { headers: { "User-Agent": "illusions-app" } }, (res) => {
          // Always attach an error handler before draining/branching, so a reset
          // while a redirect/non-200 body drains can't crash the main process
          // with an unhandled 'error'. Once piping, pipeline owns the error.
          res.on("error", (err) => {
            if (!piping) fail(err);
          });

          if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
            const location = res.headers.location;
            if (location) {
              let nextUrl;
              try {
                nextUrl = new URL(location, requestUrl).toString();
              } catch {
                fail(new Error("リダイレクト先URLが不正です"));
                return;
              }
              // Start the next hop only AFTER this response fully drains, so a
              // late error on this (now-finished) hop can't reject while the
              // next hop is mid-flight.
              res.on("end", () => doRequest(nextUrl, redirectCount + 1));
              res.resume();
              return;
            }
          }
          if (res.statusCode !== 200) {
            res.resume();
            fail(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          let received = 0;
          const hash = crypto.createHash("sha256");
          res.on("data", (chunk) => {
            received += chunk.length;
            hash.update(chunk);
            if (received > MAX_ASSET_BYTES) {
              // Destroy the source with an error; pipeline tears down the write
              // stream and fires its callback with this error.
              res.destroy(new Error("ダウンロードサイズが上限を超えました"));
            }
          });
          // pipeline() destroys the destination on ANY source error (network
          // error, timeout-triggered req.destroy, size-cap abort), closing the
          // fd before we settle — avoids leaked/locked temp files.
          piping = true;
          pipeline(res, fs.createWriteStream(destPath), (err) => {
            if (err) {
              fail(err);
              return;
            }
            const actual = hash.digest("hex");
            if (expectedDigest && actual !== expectedDigest) {
              fail(new Error("ダウンロードのチェックサム検証に失敗しました"));
              return;
            }
            succeed(actual);
          });
        });
        // Pre-response failures (DNS/connect) settle here; once piping, the
        // pipeline callback owns settlement so cleanup never races an open fd.
        req.on("error", (err) => {
          if (!piping) fail(err);
        });
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
          req.destroy(new Error("ダウンロードがタイムアウトしました"));
        });
      };
      doRequest(url);
    });
  }
}

let _instance = null;
function getRulesetsManager() {
  if (!_instance) _instance = new RulesetsManager();
  return _instance;
}

module.exports = {
  getRulesetsManager,
  RulesetsManager,
  // pure helpers (testing)
  selectReleaseAssets,
  isCompatibleEngineApi,
  needsUpdate,
  normalizeDigest,
  extractTagFromLocation,
  isSafeRulesetId,
  SUPPORTED_ENGINE_API,
};
