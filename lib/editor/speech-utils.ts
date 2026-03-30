import type { Node as ProsemirrorNode } from "@milkdown/prose/model";

/**
 * Splits flat TTS text into segments delimited by Unicode punctuation and whitespace.
 * Each segment is a contiguous run of non-punctuation/non-space characters,
 * identified by [start, end) indices into the original text.
 */
const SEGMENT_SPLIT_RE = /[\p{P}\s\u3000]/u;

export function buildSegments(text: string): Array<{ start: number; end: number }> {
  const segments: Array<{ start: number; end: number }> = [];
  let segStart = -1;
  for (let i = 0; i < text.length; i++) {
    if (SEGMENT_SPLIT_RE.test(text[i])) {
      if (segStart >= 0) {
        segments.push({ start: segStart, end: i });
        segStart = -1;
      }
    } else {
      if (segStart < 0) segStart = i;
    }
  }
  if (segStart >= 0) segments.push({ start: segStart, end: text.length });
  return segments;
}

/**
 * Builds speech chunks from segments. Each chunk contains:
 * - speech: text to speak (segment + trailing punctuation for natural TTS pauses)
 * - highlightStart/End: [start, end) indices into flat text for decoration
 */
export function buildSpeechChunks(
  text: string,
  segments: Array<{ start: number; end: number }>,
): Array<{ speech: string; highlightStart: number; highlightEnd: number }> {
  if (segments.length === 0) return [];
  return segments.map((seg, i) => {
    // Include leading punctuation for the first chunk, trailing punctuation for all
    const speechStart = i === 0 ? 0 : seg.start;
    const speechEnd = i < segments.length - 1 ? segments[i + 1].start : text.length;
    return {
      speech: text.slice(speechStart, speechEnd),
      highlightStart: seg.start,
      highlightEnd: seg.end,
    };
  });
}

/** Maps each char in flat text to its doc position. Block boundaries are skipped. */
export function buildSpeechMap(
  doc: ProsemirrorNode,
  from: number,
  to: number,
): { text: string; positions: number[] } {
  const chars: string[] = [];
  const positions: number[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      const s = Math.max(pos, from);
      const e = Math.min(pos + node.nodeSize, to);
      for (let i = s; i < e; i++) {
        chars.push(node.text![i - pos]);
        positions.push(i);
      }
    }
    return true;
  });
  return { text: chars.join(""), positions };
}
