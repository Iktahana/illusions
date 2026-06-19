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

  async _syncOne(spec) {
    const release = await this._fetchLatestRelease(spec);
    const latestTag = release?.tag_name ?? null;
    const { index: indexAsset, manifest: manifestAsset } = selectReleaseAssets(release?.assets);

    if (!latestTag || !indexAsset || !manifestAsset) {
      return { id: spec.id, status: "skipped", detail: "no installable release" };
    }

    const installedTag = this._readInstalledTag(spec.id);
    if (!needsUpdate(installedTag, latestTag)) {
      return { id: spec.id, status: "up-to-date", detail: latestTag };
    }

    const indexUrl = indexAsset.browser_download_url;
    const manifestUrl = manifestAsset.browser_download_url;
    if (!this._isAllowedAssetUrl(indexUrl) || !this._isAllowedAssetUrl(manifestUrl)) {
      return { id: spec.id, status: "skipped", detail: "asset host not allowed" };
    }

    const dir = this._rulesetDir(spec.id);
    fs.mkdirSync(dir, { recursive: true });
    const tmpManifest = path.join(dir, `${ASSET_MANIFEST}.download`);
    const tmpIndex = path.join(dir, `${ASSET_INDEX}.download`);

    try {
      // 1. manifest first — validate engineApi before fetching code.
      await this._downloadFile(manifestUrl, tmpManifest, normalizeDigest(manifestAsset.digest));
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(tmpManifest, "utf8"));
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
      await this._downloadFile(indexUrl, tmpIndex, normalizeDigest(indexAsset.digest));

      // 3. atomic install: move temps into place, then record the tag.
      fs.renameSync(tmpManifest, path.join(dir, ASSET_MANIFEST));
      fs.renameSync(tmpIndex, path.join(dir, ASSET_INDEX));
      fs.writeFileSync(path.join(dir, VERSION_FILE), latestTag, "utf8");

      console.log(`[Rulesets] installed ${spec.id} ${latestTag}`);
      return {
        id: spec.id,
        status: "installed",
        detail: latestTag,
      };
    } finally {
      for (const p of [tmpManifest, tmpIndex]) {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
          /* ignore cleanup errors */
        }
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
            if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
              const location = res.headers.location;
              if (location) {
                res.resume();
                doRequest(new URL(location, requestUrl).toString(), redirectCount + 1);
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
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error("ダウンロードのリダイレクトが最大回数を超えました"));
          return;
        }
        let parsed;
        try {
          parsed = new URL(requestUrl);
        } catch {
          reject(new Error("ダウンロードURLの形式が不正です"));
          return;
        }
        if (parsed.protocol !== "https:") {
          reject(new Error("https 以外のダウンロード先は許可されていません"));
          return;
        }
        // Re-validate the host on EVERY hop (including redirects), so a redirect
        // can never steer the download to a host outside the allowlist.
        if (!ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) {
          reject(new Error("ダウンロード先のホストが許可されていません"));
          return;
        }
        const req = https.get(requestUrl, { headers: { "User-Agent": "illusions-app" } }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
            const location = res.headers.location;
            if (location) {
              res.resume();
              doRequest(new URL(location, requestUrl).toString(), redirectCount + 1);
              return;
            }
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          let received = 0;
          let aborted = false;
          const hash = crypto.createHash("sha256");
          const fileStream = fs.createWriteStream(destPath);
          res.on("data", (chunk) => {
            if (aborted) return;
            received += chunk.length;
            if (received > MAX_ASSET_BYTES) {
              aborted = true;
              res.destroy();
              fileStream.destroy();
              reject(new Error("ダウンロードサイズが上限を超えました"));
              return;
            }
            hash.update(chunk);
          });
          res.pipe(fileStream);
          fileStream.on("close", () => {
            if (aborted) return;
            const actual = hash.digest("hex");
            if (expectedDigest && actual !== expectedDigest) {
              reject(new Error("ダウンロードのチェックサム検証に失敗しました"));
              return;
            }
            resolve(actual);
          });
          fileStream.on("error", reject);
          res.on("error", reject);
        });
        req.on("error", reject);
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
