/**
 * Shared dialogue-masking utility for lint rules.
 *
 * Replaces content inside 「」 and 『』 brackets with the filler
 * character 〇 so that rules analysing narration text are not
 * distracted by dialogue content.
 */

/**
 * Mask dialogue content within Japanese quotation brackets.
 *
 * Characters inside 「」 and 『』 (including the brackets themselves)
 * are replaced with 〇. Handles nested brackets via depth tracking.
 */
export function maskDialogue(text: string): string {
  let result = "";
  let depth = 0;

  for (const ch of text) {
    if (ch === "「" || ch === "『") {
      depth++;
      result += "〇";
    } else if (ch === "」" || ch === "』") {
      if (depth > 0) depth--;
      result += "〇";
    } else if (depth > 0) {
      result += "〇";
    } else {
      result += ch;
    }
  }

  return result;
}
