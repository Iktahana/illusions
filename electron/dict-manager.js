/**
 * DictManager — Electron main process dictionary manager.
 *
 * Responsibilities:
 *  - Open and cache the Genji SQLite database
 *  - Ensure indexes exist for fast prefix search
 *  - Query entries and definitions
 *  - Check for updates via GitHub Releases API
 *  - Download and install new database versions
 *  - Enforce a single-download mutex across multiple windows
 */

const path = require("path");
const fs = require("fs");
const https = require("https");
const zlib = require("zlib");
const crypto = require("crypto");
const { app } = require("electron");

const PROVIDER_ID = "genji";
const GITHUB_OWNER = "illusions-lab";
const GITHUB_REPO = "Genji";
const DB_FILENAME = "genji.db";
const DB_TEMP_FILENAME = "genji.db.tmp";
const VERSION_FILENAME = "genji_version.txt";

// Security: dictionary assets may only be downloaded over https from these hosts
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

// ---------------------------------------------------------------------------
// Simple promise-chain mutex (main-process, no module import needed)
// ---------------------------------------------------------------------------
class Mutex {
  constructor() {
    this._queue = Promise.resolve();
    this._locked = false;
  }

  /** Returns true if a download is currently in progress */
  get locked() {
    return this._locked;
  }

  /**
   * Acquire the mutex. The returned release function MUST be called in finally.
   * @returns {Promise<() => void>}
   */
  acquire() {
    let release;
    const next = new Promise((resolve) => {
      release = resolve;
    });
    const result = this._queue.then(() => {
      this._locked = true;
      return () => {
        this._locked = false;
        release();
      };
    });
    this._queue = this._queue.then(() => next);
    return result;
  }
}

class DictManager {
  constructor() {
    this._db = null;
    this._dbPath = null;
    this._versionPath = null;
    this._downloadMutex = new Mutex();
    this._latestAssetUrl = null;
    this._latestAssetDigest = null;
    this._latestVersion = null;
    // Set when a DB open/query fails with a corruption-class error, so getStatus
    // can report "corrupt" without re-running an integrity scan on every call.
    this._corrupt = false;
  }

  /**
   * Does this error look like SQLite database corruption (truncated download,
   * bad header, encrypted/foreign file)? Used to flip the corrupt flag so the
   * UI can prompt a re-download.
   * @private
   * @param {unknown} err
   * @returns {boolean}
   */
  _isCorruptionError(err) {
    const msg = String(err?.message ?? err ?? "").toLowerCase();
    return (
      msg.includes("malformed") ||
      msg.includes("not a database") ||
      msg.includes("file is encrypted") ||
      msg.includes("disk image is malformed")
    );
  }

  /**
   * Validate that an asset download URL is https and points to an allowed host.
   * @private
   * @param {string} url
   * @returns {boolean}
   */
  _isAllowedAssetUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname);
    } catch {
      return false;
    }
  }

  /** Escape LIKE wildcards so user input cannot inject patterns. */
  _escapeLike(str) {
    return str.replace(/[%_\\]/g, "\\$&");
  }

  _getDictDir() {
    return path.join(app.getPath("userData"), "dict");
  }

  _getDbPath() {
    if (!this._dbPath) {
      this._dbPath = path.join(this._getDictDir(), DB_FILENAME);
    }
    return this._dbPath;
  }

  _getVersionPath() {
    if (!this._versionPath) {
      this._versionPath = path.join(this._getDictDir(), VERSION_FILENAME);
    }
    return this._versionPath;
  }

  _ensureDictDir() {
    const dir = this._getDictDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Database access
  // ---------------------------------------------------------------------------

  /**
   * Open a better-sqlite3 connection. Single seam for all three open sites
   * (read handle, index writer, integrity probe) so tests can inject a fake DB
   * without mocking the native module (which vitest externalizes).
   * @private
   * @param {string} dbPath
   * @param {{ readonly?: boolean }} [opts]
   */
  _createDatabase(dbPath, opts) {
    const Database = require("better-sqlite3");
    return new Database(dbPath, opts);
  }

  _openDb() {
    if (this._db) return this._db;

    const dbPath = this._getDbPath();
    if (!fs.existsSync(dbPath)) return null;

    // Only attempt index creation / WAL if the file is writable
    try {
      fs.accessSync(dbPath, fs.constants.W_OK);
      this._ensureIndexes(dbPath);
    } catch {
      // File is read-only on disk — skip index/WAL setup
      console.warn("[DictManager] DB file is not writable; skipping index/WAL setup");
    }

    try {
      const db = this._createDatabase(dbPath, { readonly: true });
      this._db = db;
      this._corrupt = false;
      console.log("[DictManager] Database opened:", dbPath);
      return db;
    } catch (err) {
      console.error("[DictManager] Failed to open database:", err);
      if (this._isCorruptionError(err)) this._corrupt = true;
      return null;
    }
  }

  /**
   * Check and create indexes if missing. Uses a short-lived writable connection
   * so the main readonly handle is never leaked.
   * @param {string} dbPath
   */
  _ensureIndexes(dbPath) {
    let rwDb = null;
    try {
      rwDb = this._createDatabase(dbPath);

      // Check if the entries table exists at all
      const tableCheck = rwDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'")
        .get();
      if (!tableCheck) {
        console.warn("[DictManager] 'entries' table not found in database");
        return;
      }

      // Enable WAL mode (only effective on a writable connection)
      rwDb.pragma("journal_mode = WAL");

      // Add indexes if not present
      const indexCheck = rwDb
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_dict_entry_text'")
        .get();
      if (!indexCheck) {
        console.log("[DictManager] Creating indexes...");
        rwDb.exec("CREATE INDEX IF NOT EXISTS idx_dict_entry_text ON entries(entry);");
        console.log("[DictManager] Indexes created");
      }
    } catch (err) {
      // Index creation is best-effort; don't fail the whole open
      console.warn("[DictManager] Index check/create failed:", err);
    } finally {
      if (rwDb) {
        try {
          rwDb.close();
        } catch {}
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Public: query
  // ---------------------------------------------------------------------------

  /**
   * Query entries by headword (exact or prefix).
   * @param {string} term
   * @param {number} limit
   * @returns {import("../lib/dict/dict-types").DictEntry[]}
   */
  query(term, limit = 20) {
    // Avoid opening the DB while a download/rename is in progress
    if (this._downloadMutex.locked) return [];
    const db = this._openDb();
    if (!db) return [];

    try {
      // Exact match first, then prefix matches; escape LIKE wildcards
      const escaped = this._escapeLike(term);
      const rows = db
        .prepare(
          `SELECT raw_json FROM entries
           WHERE entry = ? OR entry LIKE ? ESCAPE '\\'
           ORDER BY (entry = ?) DESC, length(entry)
           LIMIT ?`,
        )
        .all(term, `${escaped}%`, term, limit);

      return rows.map((row) => this._rawJsonToEntry(row.raw_json)).filter(Boolean);
    } catch (err) {
      console.error("[DictManager] query error:", err);
      if (this._isCorruptionError(err)) this._corrupt = true;
      return [];
    }
  }

  /**
   * Query entries by kana reading (homophone lookup).
   * @param {string} reading
   * @param {number} limit
   * @returns {import("../lib/dict/dict-types").DictEntry[]}
   */
  queryByReading(reading, limit = 20) {
    // Avoid opening the DB while a download/rename is in progress
    if (this._downloadMutex.locked) return [];
    const db = this._openDb();
    if (!db) return [];

    try {
      const rows = db
        .prepare(
          `SELECT raw_json FROM entries
           WHERE reading_primary = ?
           ORDER BY length(entry)
           LIMIT ?`,
        )
        .all(reading, limit);

      return rows.map((row) => this._rawJsonToEntry(row.raw_json)).filter(Boolean);
    } catch (err) {
      console.error("[DictManager] queryByReading error:", err);
      if (this._isCorruptionError(err)) this._corrupt = true;
      return [];
    }
  }

  /**
   * Exact-match batch lookup for analysis features (vocabulary stats,
   * readability, ruby, lint rules). Returns a lightweight projection per term —
   * never the full DictEntry — so hundreds of words cost one query + one small
   * IPC payload. Terms with no match are simply absent from the result.
   *
   * @param {string[]} terms
   * @returns {Array<{ entry: string } & import("../lib/dict/dict-types").DictLookup>}
   */
  lookupBatch(terms) {
    if (this._downloadMutex.locked) return [];
    if (!Array.isArray(terms)) return [];
    const unique = [...new Set(terms.filter((t) => typeof t === "string" && t.length > 0))];
    if (unique.length === 0) return [];

    const db = this._openDb();
    if (!db) return [];

    try {
      const placeholders = unique.map(() => "?").join(",");
      const rows = db
        .prepare(`SELECT entry, raw_json FROM entries WHERE entry IN (${placeholders})`)
        .all(...unique);

      const byEntry = new Map();
      for (const row of rows) {
        if (byEntry.has(row.entry)) continue; // first row wins for a given headword
        const proj = this._rawJsonToLookup(row.raw_json);
        if (proj) byEntry.set(row.entry, { entry: row.entry, ...proj });
      }
      return [...byEntry.values()];
    } catch (err) {
      console.error("[DictManager] lookupBatch error:", err);
      if (this._isCorruptionError(err)) this._corrupt = true;
      return [];
    }
  }

  /**
   * Project a raw_json string into the lightweight {@link DictLookup} shape
   * (reading / pos / register / freqRank). Mirrors the analysis projection in
   * lib/dict/providers/genji-api-backend.ts.
   * @private
   */
  _rawJsonToLookup(rawJson) {
    if (!rawJson) return null;
    let raw;
    try {
      raw = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    } catch {
      return null;
    }
    if (!raw) return null;

    const register = (raw.definitions ?? []).find((d) => d?.register)?.register;
    return {
      found: true,
      reading: raw.reading?.primary || undefined,
      pos: raw.grammar?.pos?.join("・") || undefined,
      register: register || undefined,
      freqRank: typeof raw.meta?.freq_rank === "number" ? raw.meta.freq_rank : undefined,
    };
  }

  /**
   * Fast integrity check used to decide whether the installed DB is usable or
   * needs re-downloading. Opens a short-lived read-only connection and runs a
   * sentinel (schema + one row) rather than a full `PRAGMA integrity_check`,
   * which would scan the whole ~500 MB file. Catches the realistic corruption
   * modes: truncated download, bad header, missing `entries` table.
   *
   * @returns {{ ok: boolean, reason?: "not-installed" | "schema" | "malformed" }}
   */
  verify() {
    const dbPath = this._getDbPath();
    if (!fs.existsSync(dbPath)) return { ok: false, reason: "not-installed" };
    // Mid-install: the file may be momentarily inconsistent; don't flag it.
    if (this._downloadMutex.locked) return { ok: true };

    let probe = null;
    try {
      probe = this._createDatabase(dbPath, { readonly: true });
      const tbl = probe
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'")
        .get();
      if (!tbl) {
        this._corrupt = true;
        return { ok: false, reason: "schema" };
      }
      probe.prepare("SELECT raw_json FROM entries LIMIT 1").get();
      this._corrupt = false;
      return { ok: true };
    } catch (err) {
      console.error("[DictManager] verify failed:", err);
      this._corrupt = true;
      return { ok: false, reason: "malformed" };
    } finally {
      if (probe) {
        try {
          probe.close();
        } catch {}
      }
    }
  }

  /**
   * Parse a raw_json string from the entries table and map it to a DictEntry.
   * Mirrors mapRawJsonToDictEntry() in lib/dict/providers/genji-api-backend.ts.
   * @private
   */
  _rawJsonToEntry(rawJson) {
    if (!rawJson) return null;
    let raw;
    try {
      raw = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    } catch {
      return null;
    }

    const reading = {
      primary: raw.reading?.primary ?? "",
      alternatives: raw.reading?.alternatives ?? [],
    };

    const definitions = (raw.definitions ?? []).map((d) => {
      const examples = [];
      if (d.examples?.standard) {
        for (const ex of d.examples.standard) {
          if (ex.text) examples.push({ text: ex.text, source: ex.source, citation: ex.citation });
        }
      }
      if (d.examples?.literary) {
        for (const ex of d.examples.literary) {
          if (ex.text) examples.push({ text: ex.text, source: ex.source, citation: ex.citation });
        }
      }
      return {
        gloss: d.gloss ?? "",
        register: d.register || undefined,
        nuance: d.nuance || undefined,
        collocations: d.collocations?.length ? d.collocations : undefined,
        examples: examples.length > 0 ? examples : undefined,
      };
    });

    const relationships = {
      homophones: raw.relations?.homophones ?? [],
      synonyms: raw.relations?.synonyms ?? [],
      antonyms: raw.relations?.antonyms ?? [],
      related: raw.relations?.related ?? [],
    };

    return {
      id: raw.uuid ?? raw.entry,
      entry: raw.entry,
      reading,
      partOfSpeech: raw.grammar?.pos?.join("・") || undefined,
      inflections: raw.grammar?.inflections ?? undefined,
      definitions,
      relationships,
      source: PROVIDER_ID,
    };
  }

  // ---------------------------------------------------------------------------
  // Public: status and version
  // ---------------------------------------------------------------------------

  /**
   * Returns the current installation status of the dictionary.
   * @returns {{ status: string, installedVersion?: string, updateAvailable?: boolean }}
   */
  getStatus() {
    const dbPath = this._getDbPath();
    const installed = fs.existsSync(dbPath);
    if (!installed) {
      return { status: "not-installed" };
    }

    let installedVersion;
    try {
      installedVersion = fs.readFileSync(this._getVersionPath(), "utf8").trim();
    } catch {}

    // A prior open/query tripped the corruption flag — surface it so the UI can
    // prompt a re-download instead of silently returning empty results forever.
    if (this._corrupt) {
      return { status: "corrupt", installedVersion };
    }

    return { status: "installed", installedVersion };
  }

  /**
   * Check GitHub Releases for the latest version.
   * @returns {Promise<{ latestVersion: string, installedVersion?: string, updateAvailable: boolean }>}
   */
  checkUpdate() {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

    return this._fetchJson(url).then((json) => {
      const latestVersion = json.tag_name ?? "";

      let installedVersion;
      try {
        installedVersion = fs.readFileSync(this._getVersionPath(), "utf8").trim();
      } catch {}

      const updateAvailable =
        !!latestVersion && (!installedVersion || installedVersion !== latestVersion);

      // Cache asset download URL for later use (scheme/host allowlist validated)
      const asset = (json.assets ?? []).find((a) => a.name && a.name.endsWith(".db.gz"));
      const assetUrl = asset?.browser_download_url ?? null;
      if (assetUrl && !this._isAllowedAssetUrl(assetUrl)) {
        console.warn("[DictManager] Rejected asset URL (scheme/host not allowed):", assetUrl);
      }
      this._latestAssetUrl = assetUrl && this._isAllowedAssetUrl(assetUrl) ? assetUrl : null;
      this._latestAssetDigest = typeof asset?.digest === "string" ? asset.digest : null;
      this._latestVersion = latestVersion;

      return { latestVersion, installedVersion, updateAvailable };
    });
  }

  /**
   * Fetch JSON from GitHub API while following redirects.
   * @private
   * @param {string} url
   * @returns {Promise<any>}
   */
  _fetchJson(url) {
    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error("GitHub API のリダイレクトが最大回数（5回）を超えました"));
          return;
        }

        const req = https.get(
          requestUrl,
          {
            headers: {
              "User-Agent": "illusions-app",
              Accept: "application/vnd.github.v3+json",
            },
          },
          (res) => {
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
        req.setTimeout(10000, () => {
          req.destroy(new Error("GitHub API リクエストがタイムアウトしました"));
        });
      };

      doRequest(url);
    });
  }

  // ---------------------------------------------------------------------------
  // Public: download
  // ---------------------------------------------------------------------------

  /**
   * Download and install the latest dictionary database.
   * Progress is reported via the onProgress callback (0–100).
   * Protected by a mutex to prevent concurrent downloads.
   *
   * @param {(progress: number) => void} onProgress
   * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
   */
  async download(onProgress) {
    if (this._downloadMutex.locked) {
      return { success: false, error: "ダウンロードはすでに進行中です" };
    }

    const release = await this._downloadMutex.acquire();
    try {
      return await this._doDownload(onProgress);
    } finally {
      release();
    }
  }

  /** @private */
  async _doDownload(onProgress) {
    try {
      // Fetch release info if not cached
      if (!this._latestAssetUrl) {
        await this.checkUpdate();
      }

      if (!this._latestAssetUrl) {
        return { success: false, error: "ダウンロードURLが取得できませんでした" };
      }

      this._ensureDictDir();
      const tempPath = path.join(this._getDictDir(), DB_TEMP_FILENAME);
      const finalPath = this._getDbPath();

      // Download the .db.gz file (resolves with the sha256 hex digest of the payload)
      const actualDigest = await this._downloadFile(this._latestAssetUrl, tempPath, onProgress);

      // Verify checksum against the GitHub API asset digest before installing
      const expectedDigest = (this._latestAssetDigest ?? "").replace(/^sha256:/, "").toLowerCase();
      if (!expectedDigest) {
        throw new Error(
          "辞書ファイルのチェックサムが取得できなかったためダウンロードを中止しました",
        );
      }
      if (actualDigest !== expectedDigest) {
        throw new Error("辞書ファイルのチェックサム検証に失敗しました");
      }

      // Report decompression start
      onProgress?.(95);

      // Decompress .gz in place
      await this._decompressGzip(tempPath, finalPath + ".decompressing");

      // Clean up temp file
      fs.unlinkSync(tempPath);

      // Close existing DB connection before replacing file
      if (this._db) {
        try {
          this._db.close();
        } catch {}
        this._db = null;
      }

      // Atomically replace the database file
      fs.renameSync(finalPath + ".decompressing", finalPath);

      // Save version
      if (this._latestVersion) {
        fs.writeFileSync(this._getVersionPath(), this._latestVersion, "utf8");
      }

      onProgress?.(100);
      const version = this._latestVersion;
      // Fresh install replaces any corrupt file — clear the flag.
      this._corrupt = false;
      console.log("[DictManager] Download complete:", version);

      // Clear cached release info so next download fetches fresh data
      this._latestAssetUrl = null;
      this._latestAssetDigest = null;
      this._latestVersion = null;

      return { success: true, version };
    } catch (err) {
      console.error("[DictManager] Download failed:", err);
      // Clean up partial files
      for (const p of [
        path.join(this._getDictDir(), DB_TEMP_FILENAME),
        this._getDbPath() + ".decompressing",
      ]) {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {}
      }
      return { success: false, error: String(err?.message ?? err) };
    }
  }

  /**
   * Download a URL to a local file path, reporting progress.
   * Follows HTTP redirects (GitHub Releases uses S3 redirects), but only over https.
   * Resolves with the sha256 hex digest of the downloaded payload.
   * @private
   * @returns {Promise<string>}
   */
  _downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error("Too many redirects"));
          return;
        }

        let parsedUrl;
        try {
          parsedUrl = new URL(requestUrl);
        } catch {
          reject(new Error("ダウンロードURLの形式が不正です"));
          return;
        }

        // Security: never follow plaintext http (downgrade attack protection)
        if (parsedUrl.protocol !== "https:") {
          reject(new Error("https 以外のダウンロード先は許可されていません"));
          return;
        }

        https
          .get(requestUrl, { headers: { "User-Agent": "illusions-app" } }, (res) => {
            // Handle redirects
            if (
              res.statusCode === 301 ||
              res.statusCode === 302 ||
              res.statusCode === 303 ||
              res.statusCode === 307 ||
              res.statusCode === 308
            ) {
              const location = res.headers.location;
              if (location) {
                res.resume();
                doRequest(new URL(location, requestUrl).toString(), redirectCount + 1);
                return;
              }
            }

            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }

            const totalBytes = parseInt(res.headers["content-length"] ?? "0", 10);
            let receivedBytes = 0;
            let lastReportedPct = 0;
            const hash = crypto.createHash("sha256");

            const fileStream = fs.createWriteStream(destPath);
            res.on("data", (chunk) => {
              hash.update(chunk);
              receivedBytes += chunk.length;
              if (totalBytes > 0) {
                const pct = Math.floor((receivedBytes / totalBytes) * 90); // 0–90%
                if (pct > lastReportedPct) {
                  lastReportedPct = pct;
                  onProgress?.(pct);
                }
              }
            });
            res.pipe(fileStream);
            fileStream.on("close", () => resolve(hash.digest("hex")));
            fileStream.on("error", reject);
            res.on("error", reject);
          })
          .on("error", reject);
      };

      doRequest(url);
    });
  }

  /**
   * Decompress a .gz file to the given destination path.
   * @private
   */
  _decompressGzip(srcPath, destPath) {
    return new Promise((resolve, reject) => {
      const src = fs.createReadStream(srcPath);
      const dest = fs.createWriteStream(destPath);
      const gunzip = zlib.createGunzip();

      src.on("error", reject);
      gunzip.on("error", reject);
      dest.on("error", reject);
      dest.on("close", resolve);

      src.pipe(gunzip).pipe(dest);
    });
  }
}

// Singleton
let _manager = null;

function getDictManager() {
  if (!_manager) {
    _manager = new DictManager();
  }
  return _manager;
}

module.exports = { getDictManager };
