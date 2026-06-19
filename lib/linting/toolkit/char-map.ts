/**
 * Character-map helpers.
 *
 * Prefer {@link nfkc} for standard width/compatibility conversions. Use char
 * maps only for curated, non-standard substitutions that NFKC does not cover.
 */

/** Build a per-character mapper that passes through unmapped characters. */
export function charMap(map: ReadonlyMap<string, string>): (ch: string) => string {
  return (ch: string): string => map.get(ch) ?? ch;
}

/**
 * Apply a character map across a whole string, iterating by Unicode code point
 * so astral characters (surrogate pairs) are handled as single units.
 */
export function applyCharMap(map: ReadonlyMap<string, string>, input: string): string {
  let out = "";
  for (const ch of input) {
    out += map.get(ch) ?? ch;
  }
  return out;
}
