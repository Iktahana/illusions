/* eslint-disable no-console */
/**
 * DictManager — Electron main process dictionary manager.
 *
 * Responsibilities:
 *  - Open and cache the illusionsDict SQLite database
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
const { app } = require("electron");

const PROVIDER_ID = "illusions-dict";
const GITHUB_OWNER = "Iktahana";
const GITHUB_REPO = "illusionsDict-Word-Database";
const DB_FILENAME = "illusions_dict.db";
const DB_TEMP_FILENAME = "illusions_dict.db.tmp";
const VERSION_FILENAME = "illusions_dict_version.txt";

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
    this._latestVersion = null;
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

  _openDb() {
    if (this._db) return this._db;

    const dbPath = this._getDbPath();
    if (!fs.existsSync(dbPath)) return null;

    // Ensure indexes exist before opening readonly — uses a separate writable connection
    this._ensureIndexes(dbPath);

    try {
      const Database = require("better-sqlite3");
      const db = new Database(dbPath, { readonly: true });
      this._db = db;
      console.log("[DictManager] Database opened:", dbPath);
      return db;
    } catch (err) {
      console.error("[DictManager] Failed to open database:", err);
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
      const Database = require("better-sqlite3");
      rwDb = new Database(dbPath);

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
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_dict_entry_text'",
        )
        .get();
      if (!indexCheck) {
        console.log("[DictManager] Creating indexes...");
        rwDb.exec(
          "CREATE INDEX IF NOT EXISTS idx_dict_entry_text ON entries(entry);" +
            "CREATE INDEX IF NOT EXISTS idx_dict_definitions_entry_id ON definitions(entry_id);",
        );
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
    const db = this._openDb();
    if (!db) return [];

    try {
      // Exact match first, then prefix matches; escape LIKE wildcards
      const escaped = this._escapeLike(term);
      const rows = db
        .prepare(
          `SELECT e.id, e.entry, e.reading, e.part_of_speech, e.inflections, e.relations
           FROM entries e
           WHERE e.entry = ? OR e.entry LIKE ? ESCAPE '\\'
           ORDER BY (e.entry = ?) DESC, e.entry
           LIMIT ?`,
        )
        .all(term, `${escaped}%`, term, limit);

      return rows.map((row) => this._rowToEntry(row, db));
    } catch (err) {
      console.error("[DictManager] query error:", err);
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
    const db = this._openDb();
    if (!db) return [];

    try {
      const escaped = this._escapeLike(reading);
      const rows = db
        .prepare(
          `SELECT e.id, e.entry, e.reading, e.part_of_speech, e.inflections, e.relations
           FROM entries e
           WHERE json_extract(e.reading, '$.primary') = ?
              OR json_extract(e.reading, '$.primary') LIKE ? ESCAPE '\\'
           ORDER BY (json_extract(e.reading, '$.primary') = ?) DESC, e.entry
           LIMIT ?`,
        )
        .all(reading, `${escaped}%`, reading, limit);

      return rows.map((row) => this._rowToEntry(row, db));
    } catch (err) {
      console.error("[DictManager] queryByReading error:", err);
      return [];
    }
  }

  /**
   * Map a DB row to a DictEntry. Fetches definitions via a separate query.
   * @private
   */
  _rowToEntry(row, db) {
    let reading = { primary: "", alternatives: [] };
    let relationships = { homophones: [], synonyms: [], antonyms: [], related: [] };
    let inflections = [];

    try {
      reading = JSON.parse(row.reading ?? "{}");
    } catch {}
    try {
      const rel = JSON.parse(row.relations ?? "{}");
      relationships = {
        homophones: rel.homophones ?? [],
        synonyms: rel.synonyms ?? [],
        antonyms: rel.antonyms ?? [],
        related: rel.related ?? [],
      };
    } catch {}
    try {
      inflections = JSON.parse(row.inflections ?? "[]");
    } catch {}

    // Fetch definitions (limited to 5 per entry to keep response size small)
    let definitions = [];
    try {
      const defRows = db
        .prepare(
          `SELECT gloss, register, nuance, examples, collocations
           FROM definitions
           WHERE entry_id = ?
           LIMIT 5`,
        )
        .all(row.id);

      definitions = defRows.map((d) => ({
        gloss: d.gloss ?? "",
        register: d.register || undefined,
        nuance: d.nuance || undefined,
        examples: this._parseJsonArray(d.examples),
        collocations: this._parseJsonArray(d.collocations),
      }));
    } catch {}

    return {
      id: row.id,
      entry: row.entry,
      reading,
      partOfSpeech: row.part_of_speech || undefined,
      inflections: inflections.length > 0 ? inflections : undefined,
      definitions,
      relationships,
      source: PROVIDER_ID,
    };
  }

  /** @private */
  _parseJsonArray(value) {
    if (!value) return undefined;
    try {
      const arr = JSON.parse(value);
      return Array.isArray(arr) && arr.length > 0 ? arr : undefined;
    } catch {
      return undefined;
    }
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

    return { status: "installed", installedVersion };
  }

  /**
   * Check GitHub Releases for the latest version.
   * @returns {Promise<{ latestVersion: string, installedVersion?: string, updateAvailable: boolean }>}
   */
  checkUpdate() {
    return new Promise((resolve, reject) => {
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
      const req = https.get(
        url,
        {
          headers: {
            "User-Agent": "illusions-app",
            Accept: "application/vnd.github.v3+json",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`GitHub API returned HTTP ${res.statusCode}`));
            return;
          }
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              const latestVersion = json.tag_name ?? "";

              let installedVersion;
              try {
                installedVersion = fs.readFileSync(this._getVersionPath(), "utf8").trim();
              } catch {}

              const updateAvailable =
                !!latestVersion && (!installedVersion || installedVersion !== latestVersion);

              // Cache asset download URL for later use
              const asset = (json.assets ?? []).find(
                (a) => a.name && a.name.endsWith(".db.gz"),
              );
              this._latestAssetUrl = asset?.browser_download_url ?? null;
              this._latestVersion = latestVersion;

              resolve({ latestVersion, installedVersion, updateAvailable });
            } catch (err) {
              reject(err);
            }
          });
        },
      );
      req.on("error", reject);
      req.setTimeout(10000, () => {
        req.destroy(new Error("GitHub API request timed out"));
      });
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

      // Download the .db.gz file
      await this._downloadFile(this._latestAssetUrl, tempPath, onProgress);

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
      console.log("[DictManager] Download complete:", version);

      // Clear cached release info so next download fetches fresh data
      this._latestAssetUrl = null;
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
   * Follows HTTP redirects (GitHub Releases uses S3 redirects).
   * @private
   */
  _downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error("Too many redirects"));
          return;
        }

        const parsedUrl = new URL(requestUrl);
        const lib = parsedUrl.protocol === "https:" ? https : require("http");

        lib
          .get(requestUrl, { headers: { "User-Agent": "illusions-app" } }, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
              const location = res.headers.location;
              if (location) {
                res.resume();
                doRequest(location, redirectCount + 1);
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

            const fileStream = fs.createWriteStream(destPath);
            res.on("data", (chunk) => {
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
            fileStream.on("finish", resolve);
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
      dest.on("finish", resolve);

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
