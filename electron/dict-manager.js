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
const fsp = require("fs/promises");
const https = require("https");
const zlib = require("zlib");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const { app } = require("electron");
const { withTransientIoRetry } = require("./lib/transient-io-retry");

const PROVIDER_ID = "genji";
const GITHUB_OWNER = "illusions-lab";
const GITHUB_REPO = "Genji";
const DB_FILENAME = "genji.db";
const DB_TEMP_FILENAME = "genji.db.tmp";
const VERSION_FILENAME = "genji_version.txt";

// ---------------------------------------------------------------------------
// Kana normalization for reading-index fallback (#1935)
//
// The dictionary indexes headwords by their written form only (`entry`), so a
// kana spelling of a word the dict stores under a kanji headword — e.g. the verb
// 「ある」 (dict headword 「有る」) — misses an exact lookup and the 辞書外語 rule
// wrongly flags it. When an all-kana term misses, we re-query the reading index
// (`reading_primary`) so the kana resolves to its canonical headword.
//
// The all-kana GATE is the safety boundary: only fully-kana terms get the
// reading fallback. A term containing kanji (圕, 讀む) keeps exact-match
// semantics and stays flagged when genuinely absent — this avoids turning the
// lookup into a homophone engine (讀む would otherwise match 読む by reading).
// ---------------------------------------------------------------------------

/** Every char is hiragana / katakana / 長音符 (no kanji, ASCII, or symbols). */
function isAllKana(s) {
  return typeof s === "string" && s.length > 0 && /^[ぁ-ゖァ-ヺーー]+$/.test(s);
}

/** Hiragana → Katakana (code-point shift); other chars pass through. */
function toKatakana(s) {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0);
    out += c >= 0x3041 && c <= 0x3096 ? String.fromCodePoint(c + 0x60) : ch;
  }
  return out;
}

/** Katakana → Hiragana (code-point shift); other chars pass through. */
function toHiragana(s) {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0);
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/**
 * Candidate reading_primary keys for an all-kana term. We probe BOTH scripts so
 * the fallback is robust to whichever convention the dictionary stores readings
 * in (hiragana or katakana).
 */
function readingForms(term) {
  return [...new Set([term, toKatakana(term), toHiragana(term)])];
}

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
      // Reading index: powers homophone lookup (queryByReading) and the all-kana
      // reading fallback in lookupBatch (#1935). Best-effort — guarded so an
      // older DB lacking the reading_primary column doesn't fail the open.
      try {
        rwDb.exec(
          "CREATE INDEX IF NOT EXISTS idx_dict_reading_primary ON entries(reading_primary);",
        );
      } catch (readingIdxErr) {
        console.warn("[DictManager] reading index create skipped:", readingIdxErr.message);
      }
      // Variant-writings index (#1958): resolves a manuscript word written in
      // an absorbed variant form — old kanji / historical kana (e.g. ゐる→居る,
      // 來→来) — to its canonical headword so the 辞書外語 rule does not flag it
      // as unknown. `meta.variant_writings` lives inside raw_json (un-indexable
      // directly), so we materialize a (variant → entry) table once via json_each
      // and index it. Built only when absent; it persists in the DB file until a
      // dict update replaces the file, then rebuilds. Best-effort — guarded so a
      // DB lacking the field / JSON support (older DB) does not fail the open.
      try {
        const variantTbl = rwDb
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='variant_lookup'")
          .get();
        if (!variantTbl) {
          rwDb.exec(
            `CREATE TABLE variant_lookup AS
               SELECT je.value AS variant, e.entry AS entry
               FROM entries e,
                    json_each(json_extract(e.raw_json, '$.meta.variant_writings')) je
               WHERE json_valid(e.raw_json)
                 AND json_type(e.raw_json, '$.meta.variant_writings') = 'array';`,
          );
          rwDb.exec("CREATE INDEX IF NOT EXISTS idx_variant_lookup ON variant_lookup(variant);");
        }
      } catch (variantIdxErr) {
        console.warn("[DictManager] variant index create skipped:", variantIdxErr.message);
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

      const entries = rows.map((row) => this._rawJsonToEntry(row.raw_json)).filter(Boolean);
      // #1958: when neither an exact nor a prefix match exists, the term may be
      // an absorbed variant writing (旧字体/歴史的仮名遣い). Resolve it to the
      // canonical headword so the lookup panel shows the real entry (e.g. ゐる→居る)
      // instead of "not found".
      if (entries.length === 0) {
        const resolved = this._resolveHeadwordByVariant(db, term, limit);
        if (resolved.length > 0) return resolved;
      }
      return entries;
    } catch (err) {
      console.error("[DictManager] query error:", err);
      if (this._isCorruptionError(err)) this._corrupt = true;
      return [];
    }
  }

  /**
   * Resolve a term that is an absorbed variant writing to its canonical entries
   * via the `variant_lookup` table (#1958). Best-effort — returns [] when the
   * table is absent (older DB) or the query fails.
   * @private
   * @returns {import("../lib/dict/dict-types").DictEntry[]}
   */
  _resolveHeadwordByVariant(db, term, limit = 20) {
    try {
      const rows = db
        .prepare(
          `SELECT e.raw_json AS raw_json
             FROM variant_lookup vl
             JOIN entries e ON e.entry = vl.entry
            WHERE vl.variant = ?
            LIMIT ?`,
        )
        .all(term, limit);
      return rows.map((row) => this._rawJsonToEntry(row.raw_json)).filter(Boolean);
    } catch (err) {
      console.warn("[DictManager] variant headword resolve failed:", err);
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
   * When `normalize` is true (default), all-kana terms that miss the headword
   * index are re-resolved against the reading index so 表記ゆれ (e.g. kana
   * 「ある」 → headword 「有る」) does not read as out-of-dictionary. Results are
   * keyed by the REQUESTED term, so callers/caches stay keyed by what they asked.
   *
   * @param {string[]} terms
   * @param {boolean} [normalize=true] Enable the all-kana reading fallback.
   * @returns {Array<{ entry: string } & import("../lib/dict/dict-types").DictLookup>}
   */
  lookupBatch(terms, normalize = true) {
    if (this._downloadMutex.locked) return [];
    if (!Array.isArray(terms)) return [];
    const unique = [...new Set(terms.filter((t) => typeof t === "string" && t.length > 0))];
    if (unique.length === 0) return [];

    const db = this._openDb();
    if (!db) return [];

    const byEntry = new Map();
    try {
      const placeholders = unique.map(() => "?").join(",");
      const rows = db
        .prepare(`SELECT entry, raw_json FROM entries WHERE entry IN (${placeholders})`)
        .all(...unique);

      for (const row of rows) {
        if (byEntry.has(row.entry)) continue; // first row wins for a given headword
        const proj = this._rawJsonToLookup(row.raw_json);
        if (proj) byEntry.set(row.entry, { entry: row.entry, ...proj });
      }
    } catch (err) {
      console.error("[DictManager] lookupBatch error:", err);
      if (this._isCorruptionError(err)) this._corrupt = true;
      return [];
    }

    if (normalize) {
      this._resolveKanaByReading(db, unique, byEntry);
      this._resolveByVariantWriting(db, unique, byEntry);
    }
    return [...byEntry.values()];
  }

  /**
   * Variant-writings fallback (#1958) for terms that missed both the headword
   * and reading indexes. Resolves an absorbed variant form (旧字体・歴史的仮名遣い,
   * e.g. ゐる, 來) to the canonical entry via the materialized `variant_lookup`
   * table, keying the hit by the original requested term so out-of-dict callers
   * see it as found. Isolated try/catch: a missing `variant_lookup` table (older
   * DB / build skipped) degrades silently to no variant resolution.
   * @private
   */
  _resolveByVariantWriting(db, unique, byEntry) {
    const misses = unique.filter((t) => !byEntry.has(t));
    if (misses.length === 0) return;

    try {
      const placeholders = misses.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT vl.variant AS variant, e.raw_json AS raw_json
             FROM variant_lookup vl
             JOIN entries e ON e.entry = vl.entry
            WHERE vl.variant IN (${placeholders})`,
        )
        .all(...misses);

      for (const row of rows) {
        if (byEntry.has(row.variant)) continue;
        const proj = this._rawJsonToLookup(row.raw_json);
        if (proj) byEntry.set(row.variant, { entry: row.variant, ...proj });
      }
    } catch (err) {
      // variant_lookup may not exist (older DB / build skipped). Best-effort —
      // never mark corrupt, never clear existing results.
      console.warn("[DictManager] variant fallback failed:", err);
    }
  }

  /**
   * Reading-index fallback for all-kana terms that missed the headword index.
   * Mutates `byEntry`, keying each resolved hit by the original requested term.
   * Isolated try/catch: a missing `reading_primary` column (older DB) or any
   * reading-query failure degrades silently to exact-match-only — never flips a
   * word to absent and never marks the DB corrupt.
   * @private
   */
  _resolveKanaByReading(db, unique, byEntry) {
    const kanaMisses = unique.filter((t) => !byEntry.has(t) && isAllKana(t));
    if (kanaMisses.length === 0) return;

    // reading_primary candidate → requested terms that map to it
    const readingToTerms = new Map();
    for (const t of kanaMisses) {
      for (const r of readingForms(t)) {
        const list = readingToTerms.get(r);
        if (list) list.push(t);
        else readingToTerms.set(r, [t]);
      }
    }
    const readings = [...readingToTerms.keys()];
    if (readings.length === 0) return;

    try {
      const placeholders = readings.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT reading_primary, raw_json FROM entries WHERE reading_primary IN (${placeholders})`,
        )
        .all(...readings);

      for (const row of rows) {
        const targets = readingToTerms.get(row.reading_primary);
        if (!targets) continue;
        const proj = this._rawJsonToLookup(row.raw_json);
        if (!proj) continue;
        for (const t of targets) {
          if (!byEntry.has(t)) byEntry.set(t, { entry: t, ...proj });
        }
      }
    } catch (err) {
      // Reading fallback is best-effort. Do NOT mark corrupt or clear results.
      console.warn("[DictManager] reading fallback failed:", err);
    }
  }

  /**
   * Project a raw_json string into the lightweight {@link DictLookup} shape
   * (reading / pos / register / freqRank).
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
      // #1958: a skeleton entry is still a real word — surface needsGloss so the
      // analysis/lint side keeps `found:true` and only the gloss is treated as pending.
      needsGloss: raw.meta?.needs_gloss === true ? true : undefined,
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
      // #1958: variant writings (異表記) + skeleton flag from meta.
      variantWritings:
        Array.isArray(raw.meta?.variant_writings) && raw.meta.variant_writings.length > 0
          ? raw.meta.variant_writings
          : undefined,
      needsGloss: raw.meta?.needs_gloss === true ? true : undefined,
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
      await withTransientIoRetry(() => fsp.unlink(tempPath));

      // Close existing DB connection before replacing file
      if (this._db) {
        try {
          this._db.close();
        } catch {}
        this._db = null;
      }

      // Atomically replace the database file
      await withTransientIoRetry(() => fsp.rename(finalPath + ".decompressing", finalPath));

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
          await withTransientIoRetry(() => fsp.unlink(p));
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

            const fileStream = fs.createWriteStream(destPath);
            pipeline(res, fileStream)
              .then(() => resolve(hash.digest("hex")))
              .catch(reject);
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
  async _decompressGzip(srcPath, destPath) {
    await pipeline(
      fs.createReadStream(srcPath),
      zlib.createGunzip(),
      fs.createWriteStream(destPath),
    );
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

module.exports = { getDictManager, isAllKana, toKatakana, toHiragana, readingForms };
