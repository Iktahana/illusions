/* eslint-disable no-console */
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

// Mirrors ENGINE_API_VERSION in lib/linting/sdk/ruleset-types.ts. A downloaded
// ruleset whose manifest targets a different engine is skipped (incompatible).
const SUPPORTED_ENGINE_API = 1;

const ASSET_INDEX = "index.js";
const ASSET_MANIFEST = "manifest.json";
const VERSION_FILE = ".release-tag";

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

  /** True when the installed dir has BOTH required asset files (not just a tag). */
  _isInstalledComplete(id) {
    const dir = this._rulesetDir(id);
    return (
      fs.existsSync(path.join(dir, ASSET_MANIFEST)) && fs.existsSync(path.join(dir, ASSET_INDEX))
    );
  }

  /**
   * Recover from a crash that happened during a swap: if a COMPLETE staged
   * release is present but the install is missing/incomplete, promote it with no
   * network access (heals even offline). Otherwise discard stale/partial staging.
   */
  _recoverStaging(id, dir, staging) {
    try {
      const stagedComplete =
        fs.existsSync(path.join(staging, ASSET_MANIFEST)) &&
        fs.existsSync(path.join(staging, ASSET_INDEX)) &&
        fs.existsSync(path.join(staging, VERSION_FILE));
      if (stagedComplete && !this._isInstalledComplete(id)) {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(dir), { recursive: true });
        fs.renameSync(staging, dir);
        console.log(`[Rulesets] recovered staged install for ${id}`);
      } else {
        fs.rmSync(staging, { recursive: true, force: true });
      }
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

  /** Fetch the latest release JSON for an official ruleset spec. */
  async _fetchLatestRelease(spec) {
    const url = `https://api.github.com/repos/${spec.owner}/${spec.repo}/releases/latest`;
    return this._fetchJson(url);
  }

  /**
   * Check the latest release tag vs installed, without downloading.
   * @returns {Array<{ id, installedTag, latestTag, updateAvailable, hasRelease }>}
   */
  async checkUpdate() {
    const results = [];
    for (const spec of OFFICIAL_RULESETS) {
      try {
        const release = await this._fetchLatestRelease(spec);
        const latestTag = release?.tag_name ?? null;
        const { index, manifest } = selectReleaseAssets(release?.assets);
        const hasRelease = !!latestTag && !!index && !!manifest;
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
  async syncAllOfficial() {
    if (this._syncing) return [{ id: "*", status: "skipped", detail: "sync already running" }];
    this._syncing = true;
    const summary = [];
    try {
      for (const spec of OFFICIAL_RULESETS) {
        try {
          summary.push(await this._syncOne(spec));
        } catch (err) {
          console.warn(`[Rulesets] sync failed for ${spec.id}:`, err);
          summary.push({ id: spec.id, status: "error", detail: String(err?.message ?? err) });
        }
      }
    } finally {
      this._syncing = false;
    }
    return summary;
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

    const release = await this._fetchLatestRelease(spec);
    const latestTag = release?.tag_name ?? null;
    const { index: indexAsset, manifest: manifestAsset } = selectReleaseAssets(release?.assets);

    if (!latestTag || !indexAsset || !manifestAsset) {
      return { id: spec.id, status: "skipped", detail: "no installable release" };
    }

    const installedTag = this._readInstalledTag(spec.id);
    // Re-install when the tag differs OR the on-disk bundle is incomplete — a
    // surviving .release-tag must not mask a missing/corrupt asset file.
    if (!needsUpdate(installedTag, latestTag) && this._isInstalledComplete(spec.id)) {
      return { id: spec.id, status: "up-to-date", detail: latestTag };
    }

    const indexUrl = indexAsset.browser_download_url;
    const manifestUrl = manifestAsset.browser_download_url;
    if (!this._isAllowedAssetUrl(indexUrl) || !this._isAllowedAssetUrl(manifestUrl)) {
      return { id: spec.id, status: "skipped", detail: "asset host not allowed" };
    }

    try {
      fs.rmSync(staging, { recursive: true, force: true });
      fs.mkdirSync(staging, { recursive: true });

      // 1. manifest first — validate engineApi before fetching code.
      await this._downloadFile(
        manifestUrl,
        path.join(staging, ASSET_MANIFEST),
        normalizeDigest(manifestAsset.digest),
      );
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

      // 2. code asset.
      await this._downloadFile(
        indexUrl,
        path.join(staging, ASSET_INDEX),
        normalizeDigest(indexAsset.digest),
      );

      // 3. record the tag inside staging, then swap the staged dir into place.
      fs.writeFileSync(path.join(staging, VERSION_FILE), latestTag, "utf8");
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.renameSync(staging, dir);

      console.log(`[Rulesets] installed ${spec.id} ${latestTag}`);
      return { id: spec.id, status: "installed", detail: latestTag };
    } finally {
      // Remove staging if the swap did not consume it (error / skip path).
      try {
        fs.rmSync(staging, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  /** GET JSON with redirect handling + timeout. */
  _fetchJson(url) {
    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error("GitHub API のリダイレクトが最大回数を超えました"));
          return;
        }
        let parsed;
        try {
          parsed = new URL(requestUrl);
        } catch {
          reject(new Error("URL の形式が不正です"));
          return;
        }
        if (parsed.protocol !== "https:") {
          reject(new Error("https 以外の接続は許可されていません"));
          return;
        }
        const req = https.get(
          requestUrl,
          { headers: { "User-Agent": "illusions-app", Accept: "application/vnd.github.v3+json" } },
          (res) => {
            // Attach the error handler before draining/branching so a reset
            // while a redirect/404/non-200 body drains can't raise an unhandled
            // 'error' on the IncomingMessage (which would crash the main process).
            res.on("error", reject);

            if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
              const location = res.headers.location;
              if (location) {
                res.resume();
                let nextUrl;
                try {
                  nextUrl = new URL(location, requestUrl).toString();
                } catch {
                  reject(new Error("リダイレクト先URLが不正です"));
                  return;
                }
                doRequest(nextUrl, redirectCount + 1);
                return;
              }
            }
            if (res.statusCode === 404) {
              res.resume();
              reject(new Error("リリースが見つかりません (404)"));
              return;
            }
            if (res.statusCode !== 200) {
              res.resume();
              reject(new Error(`GitHub API が HTTP ${res.statusCode} を返しました`));
              return;
            }
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                resolve(JSON.parse(data));
              } catch (err) {
                reject(err);
              }
            });
          },
        );
        req.on("error", reject);
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
          req.destroy(new Error("GitHub API リクエストがタイムアウトしました"));
        });
      };
      doRequest(url);
    });
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
              res.resume();
              let nextUrl;
              try {
                nextUrl = new URL(location, requestUrl).toString();
              } catch {
                fail(new Error("リダイレクト先URLが不正です"));
                return;
              }
              doRequest(nextUrl, redirectCount + 1);
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
  SUPPORTED_ENGINE_API,
};
