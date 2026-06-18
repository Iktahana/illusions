/**
 * Master dictionary types — provider-agnostic interfaces.
 * All dictionary providers (Genji, future sources) must conform to these types.
 */

// ---------------------------------------------------------------------------
// Core entry types
// ---------------------------------------------------------------------------

export interface DictReading {
  primary: string;
  alternatives: string[];
}

export interface DictExample {
  text: string;
  source?: string;
  citation?: {
    source?: string;
    author?: string;
    note?: string;
  };
}

export interface DictDefinition {
  gloss: string;
  register?: string;
  nuance?: string;
  examples?: DictExample[];
  collocations?: string[];
}

export interface DictRelationships {
  homophones: string[];
  synonyms: string[];
  antonyms: string[];
  related: string[];
}

export interface DictEntry {
  /** Unique identifier within the provider */
  id: string;
  /** Headword (見出し語) */
  entry: string;
  reading: DictReading;
  partOfSpeech?: string;
  inflections?: string[];
  definitions: DictDefinition[];
  relationships: DictRelationships;
  /** Provider that returned this entry */
  source: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface IDictProvider {
  /** Stable identifier used to tag results (e.g. "genji") */
  readonly id: string;
  /** Human-readable name shown in UI */
  readonly displayName: string;

  /** Returns true when this provider is ready to answer queries */
  isAvailable(): Promise<boolean>;

  /**
   * Search by headword exact match or prefix.
   * @param term   Search term
   * @param limit  Max results (default: 20)
   */
  query(term: string, limit?: number): Promise<DictEntry[]>;

  /**
   * Find entries sharing the given kana reading (homophone lookup).
   * @param reading  Kana reading
   * @param limit    Max results (default: 20)
   */
  queryByReading(reading: string, limit?: number): Promise<DictEntry[]>;
}

// ---------------------------------------------------------------------------
// Download / update state
// ---------------------------------------------------------------------------

export type DictDownloadStatus =
  | "not-installed"
  | "downloading"
  | "installing"
  | "installed"
  /** DB file exists but failed an integrity check (truncated download, bad
   * header, missing table). The user should re-download. */
  | "corrupt"
  | "error";

export interface DictDownloadState {
  providerId: string;
  status: DictDownloadStatus;
  /** 0–100, only set when status === "downloading" */
  progress?: number;
  installedVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Update check result
// ---------------------------------------------------------------------------

export interface DictUpdateResult {
  latestVersion?: string;
  installedVersion?: string;
  updateAvailable?: boolean;
}

// ---------------------------------------------------------------------------
// Service query result
// ---------------------------------------------------------------------------

export interface DictQueryResult {
  entries: DictEntry[];
  /** True when the provider is installed but returned no matches */
  noResults: boolean;
  /** True when the provider is not installed / not available */
  providerUnavailable: boolean;
}

// ---------------------------------------------------------------------------
// Lightweight analysis projection
// ---------------------------------------------------------------------------

/**
 * Minimal per-term projection returned by batch lookups for analysis features
 * (vocabulary stats, readability, ruby, lint rules). Deliberately small so it
 * is cheap to ship across IPC for hundreds of words at once — never the full
 * {@link DictEntry} (definitions/examples/relations) which the lookup panel uses.
 */
export interface DictLookup {
  /** Whether the headword exists in the dictionary (exact match). */
  found: boolean;
  /** Primary kana reading (読み) — used for ruby suggestions. */
  reading?: string;
  /** Part(s) of speech, joined with "・". */
  pos?: string;
  /** Register label (口語/文章語/雅語 …) from the first definition that has one. */
  register?: string;
  /** Frequency rank (smaller = more common) — used for vocabulary difficulty. */
  freqRank?: number;
}
