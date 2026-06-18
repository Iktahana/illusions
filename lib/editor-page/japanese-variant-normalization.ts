import kyujitaiData from "kyujitai/data/kyujitai.json";

interface KyujitaiData {
  kyuji: Array<[shinjitai: string, kyujitai: string, variationSelector?: string]>;
}

const SHINJITAI_BY_KYUJITAI = new Map(
  (kyujitaiData as unknown as KyujitaiData).kyuji
    .filter(([shinjitai, kyujitai]) => shinjitai !== kyujitai)
    .map(([shinjitai, kyujitai]) => [kyujitai, shinjitai] as const),
);

/**
 * Normalizes width, kana script, and old character forms for search comparison.
 * The kyujitai table is maintained by the `kyujitai` package rather than in
 * search logic, so data changes remain independently reviewable.
 */
export function normalizeJapaneseSearchVariants(text: string): string {
  let normalized = "";

  for (const character of text.normalize("NFKC")) {
    const codePoint = character.codePointAt(0) ?? 0;
    const kana =
      codePoint >= 0x30a1 && codePoint <= 0x30f6
        ? String.fromCodePoint(codePoint - 0x60)
        : character;
    normalized += SHINJITAI_BY_KYUJITAI.get(kana) ?? kana;
  }

  return normalized;
}
