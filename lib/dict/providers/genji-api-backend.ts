/**
 * GenjiApiBackend — HTTP client for the Genji Datasette API.
 *
 * Provides remote dictionary queries using the `raw_json` field from the
 * `entries` table.  Used as a fallback backend inside GenjiProvider when
 * the local Electron IPC backend is unavailable.
 */
import type {
  DictEntry,
  DictDefinition,
  DictExample,
  DictRelationships,
  DictReading,
  DictLookup,
} from "../dict-types";
import { isAllKana, readingForms } from "../kana";

const GENJI_API_BASE = "https://api.dict.illusions.app";
const FETCH_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// raw_json shape (mirrors the Genji database schema)
// ---------------------------------------------------------------------------

interface RawExample {
  text: string;
  source?: string;
  citation?: { source?: string; author?: string; note?: string };
}

interface RawDefinition {
  index: number;
  gloss: string;
  register?: string;
  nuance?: string | null;
  collocations?: string[];
  examples?: {
    standard?: RawExample[];
    literary?: RawExample[];
  };
}

interface RawJson {
  uuid: string;
  entry: string;
  reading: {
    primary: string;
    alternatives: string[];
    is_heteronym?: boolean;
  };
  grammar: {
    pos: string[] | null;
    ctype?: string | null;
    inflections?: string[] | null;
  };
  definitions: RawDefinition[];
  relations: {
    homophones: string[];
    synonyms: string[];
    antonyms: string[];
    related: string[];
  };
  meta?: {
    version?: string;
    source?: string;
    updated_at?: string;
    freq_rank?: number;
  };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function flattenExamples(def: RawDefinition): DictExample[] {
  const out: DictExample[] = [];
  if (def.examples?.standard) {
    for (const ex of def.examples.standard) {
      if (ex.text) out.push({ text: ex.text, source: ex.source, citation: ex.citation });
    }
  }
  if (def.examples?.literary) {
    for (const ex of def.examples.literary) {
      if (ex.text) out.push({ text: ex.text, source: ex.source, citation: ex.citation });
    }
  }
  return out;
}

export function mapRawJsonToDictEntry(raw: RawJson): DictEntry {
  const reading: DictReading = {
    primary: raw.reading.primary,
    alternatives: raw.reading.alternatives ?? [],
  };

  const definitions: DictDefinition[] = (raw.definitions ?? []).map((d) => ({
    gloss: d.gloss,
    register: d.register ?? undefined,
    nuance: d.nuance ?? undefined,
    collocations: d.collocations?.length ? d.collocations : undefined,
    examples: flattenExamples(d),
  }));

  const relationships: DictRelationships = {
    homophones: raw.relations?.homophones ?? [],
    synonyms: raw.relations?.synonyms ?? [],
    antonyms: raw.relations?.antonyms ?? [],
    related: raw.relations?.related ?? [],
  };

  return {
    id: raw.uuid,
    entry: raw.entry,
    reading,
    partOfSpeech: raw.grammar?.pos?.join("・") ?? undefined,
    inflections: raw.grammar?.inflections ?? undefined,
    definitions,
    relationships,
    source: "genji",
  };
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

function buildSqlUrl(sql: string, params: Record<string, string>): string {
  const url = new URL(`${GENJI_API_BASE}/genji.json`);
  url.searchParams.set("sql", sql);
  url.searchParams.set("_shape", "objects");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

interface DatasetteResponse {
  rows: Array<{ raw_json: string }>;
}

async function executeSql(sql: string, params: Record<string, string>): Promise<RawJson[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(buildSqlUrl(sql, params), {
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[GenjiApiBackend] HTTP ${res.status} for query`);
      return [];
    }
    const data = (await res.json()) as DatasetteResponse;
    return data.rows.map((row) => {
      const parsed = typeof row.raw_json === "string" ? JSON.parse(row.raw_json) : row.raw_json;
      return parsed as RawJson;
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[GenjiApiBackend] request timed out");
    } else {
      console.warn("[GenjiApiBackend] fetch failed:", err);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search by headword — exact match first, then prefix, ordered by length.
 */
export async function queryByEntry(term: string, limit: number): Promise<DictEntry[]> {
  const sql = `
    SELECT raw_json FROM entries
    WHERE entry = :term OR entry LIKE :prefix
    ORDER BY (entry = :term) DESC, length(entry)
    LIMIT :limit
  `;
  const raws = await executeSql(sql, {
    term,
    prefix: `${term}%`,
    limit: String(limit),
  });
  return raws.map(mapRawJsonToDictEntry);
}

/** Project a raw_json row into the lightweight analysis shape. */
function rawJsonToLookup(raw: RawJson): DictLookup {
  const register = raw.definitions?.find((d) => d.register)?.register;
  return {
    found: true,
    reading: raw.reading?.primary || undefined,
    pos: raw.grammar?.pos?.join("・") || undefined,
    register: register || undefined,
    freqRank: typeof raw.meta?.freq_rank === "number" ? raw.meta.freq_rank : undefined,
  };
}

/** Headwords per remote chunk — keeps each Datasette URL well under length limits. */
const REMOTE_BATCH_CHUNK = 50;

/**
 * Batch lookup over the remote Genji API (web fallback). Issues one
 * parameterized `entry IN (...)` query per chunk. Returns a map keyed by the
 * requested term; misses map to `{ found: false }`. Slower than the local
 * Electron path, so callers doing bulk analysis should gate on dictionary
 * health and prefer the local DB.
 *
 * When `normalize` is true (default), all-kana terms that miss the headword
 * index are re-resolved via the reading index (kana 「ある」 → headword 「有る」,
 * #1935), keyed by the requested term — mirroring the local DictManager path.
 */
export async function lookupBatchRemote(
  terms: string[],
  normalize = true,
): Promise<Map<string, DictLookup>> {
  const result = new Map<string, DictLookup>();
  const unique = [...new Set(terms.filter((t) => typeof t === "string" && t.length > 0))];

  for (let i = 0; i < unique.length; i += REMOTE_BATCH_CHUNK) {
    const chunk = unique.slice(i, i + REMOTE_BATCH_CHUNK);
    const params: Record<string, string> = {};
    const names = chunk.map((t, j) => {
      params[`p${j}`] = t;
      return `:p${j}`;
    });
    const sql = `SELECT raw_json FROM entries WHERE entry IN (${names.join(",")})`;
    const raws = await executeSql(sql, params);
    for (const raw of raws) {
      if (!result.has(raw.entry)) result.set(raw.entry, rawJsonToLookup(raw));
    }
  }

  if (normalize) {
    await resolveKanaByReadingRemote(unique, result);
  }

  for (const t of unique) {
    if (!result.has(t)) result.set(t, { found: false });
  }
  return result;
}

/**
 * Reading-index fallback for all-kana misses (web). Queries `reading_primary IN
 * (...)` and maps each hit back to the requested kana term via its reading forms.
 * Mutates `result`; never overwrites an existing (exact) hit.
 */
async function resolveKanaByReadingRemote(
  unique: string[],
  result: Map<string, DictLookup>,
): Promise<void> {
  const kanaMisses = unique.filter((t) => !result.has(t) && isAllKana(t));
  if (kanaMisses.length === 0) return;

  // reading_primary candidate → requested terms that map to it
  const readingToTerms = new Map<string, string[]>();
  for (const t of kanaMisses) {
    for (const r of readingForms(t)) {
      const list = readingToTerms.get(r);
      if (list) list.push(t);
      else readingToTerms.set(r, [t]);
    }
  }
  const readings = [...readingToTerms.keys()];

  for (let i = 0; i < readings.length; i += REMOTE_BATCH_CHUNK) {
    const chunk = readings.slice(i, i + REMOTE_BATCH_CHUNK);
    const params: Record<string, string> = {};
    const names = chunk.map((r, j) => {
      params[`p${j}`] = r;
      return `:p${j}`;
    });
    const sql = `SELECT raw_json FROM entries WHERE reading_primary IN (${names.join(",")})`;
    const raws = await executeSql(sql, params);
    for (const raw of raws) {
      const targets = readingToTerms.get(raw.reading?.primary);
      if (!targets) continue;
      const lookup = rawJsonToLookup(raw);
      for (const t of targets) {
        if (!result.has(t)) result.set(t, lookup);
      }
    }
  }
}

/**
 * Find entries sharing the given kana reading (exact match).
 */
export async function queryByReading(reading: string, limit: number): Promise<DictEntry[]> {
  const sql = `
    SELECT raw_json FROM entries
    WHERE reading_primary = :reading
    ORDER BY length(entry)
    LIMIT :limit
  `;
  const raws = await executeSql(sql, {
    reading,
    limit: String(limit),
  });
  return raws.map(mapRawJsonToDictEntry);
}
