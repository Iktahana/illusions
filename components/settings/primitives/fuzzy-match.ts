/**
 * Fuzzy match helper for the settings nav search box.
 *
 * Matches in two passes so that natural typed queries and casual
 * abbreviations both work:
 *   1. Normalized substring (handles copy/paste, partial typing)
 *   2. Normalized subsequence (handles skipping characters — "ai接" → "AI API 接続")
 *
 * Normalization: NFKC + lowercase. NFKC folds full-width ASCII and
 * compatibility forms so "ＡＩ" matches "ai".
 */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

export function matchesQuery(label: string, query: string): boolean {
  const q = normalizeForSearch(query.trim());
  if (q.length === 0) return true;
  const l = normalizeForSearch(label);
  if (l.includes(q)) return true;

  let cursor = 0;
  const target = Array.from(q);
  for (const ch of l) {
    if (ch === target[cursor]) {
      cursor += 1;
      if (cursor === target.length) return true;
    }
  }
  return false;
}
