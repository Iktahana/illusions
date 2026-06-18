import { localPreferences } from "@/lib/storage/local-preferences";

const SEARCH_HISTORY_LIMIT = 10;

export function loadSearchHistory(): string[] {
  return localPreferences.getSearchHistory().slice(0, SEARCH_HISTORY_LIMIT);
}

export function addSearchHistoryEntry(searchTerm: string): string[] {
  const normalizedTerm = searchTerm.trim();
  if (!normalizedTerm) return loadSearchHistory();

  const next = [
    normalizedTerm,
    ...loadSearchHistory().filter((entry) => entry !== normalizedTerm),
  ].slice(0, SEARCH_HISTORY_LIMIT);

  localPreferences.setSearchHistory(next);
  return next;
}
