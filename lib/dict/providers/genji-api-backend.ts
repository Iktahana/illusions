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
} from "../dict-types";

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
