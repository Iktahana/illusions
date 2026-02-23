/**
 * Simple djb2 string hash.
 * Produces a short hex hash suitable for identifying paragraphs/contexts.
 *
 * Used by the linting decoration plugin and ignored-corrections hook
 * to create stable paragraph context hashes.
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return (hash >>> 0).toString(16);
}
