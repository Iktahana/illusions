/**
 * Text encoding utilities for reading and writing text files.
 *
 * Handles BOM detection, UTF-8 BOM stripping, and CRLF/LF preservation.
 * Non-UTF-8 BOMs (UTF-16 LE/BE, UTF-32) are rejected with a Japanese error message.
 */

/**
 * Result of decoding a text file buffer.
 */
export interface DecodedText {
  /** The decoded text with LF line endings (normalized in memory) */
  text: string;
  /** The original line ending style detected in the file */
  eol: "lf" | "crlf";
}

/**
 * Read a binary buffer as UTF-8 text, handling BOM detection and EOL normalization.
 *
 * - Rejects non-UTF-8 BOMs (UTF-16 LE/BE, UTF-32) with a Japanese error
 * - Strips UTF-8 BOM (EF BB BF) if present; does NOT restore on write
 * - Detects CRLF vs LF and normalizes to LF in memory
 *
 * @param buf - Raw file bytes
 * @returns DecodedText with normalized LF text and detected EOL style
 * @throws Error if a non-UTF-8 BOM is detected
 */
export function readTextWithEncoding(buf: Uint8Array): DecodedText {
  // Reject non-UTF-8 BOMs
  if (buf.length >= 4) {
    // UTF-32 LE: FF FE 00 00
    if (buf[0] === 0xff && buf[1] === 0xfe && buf[2] === 0x00 && buf[3] === 0x00) {
      throw new Error("UTF-8 以外のファイルは現在サポートされていません");
    }
    // UTF-32 BE: 00 00 FE FF
    if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0xfe && buf[3] === 0xff) {
      throw new Error("UTF-8 以外のファイルは現在サポートされていません");
    }
  }

  if (buf.length >= 2) {
    const b0 = buf[0];
    const b1 = buf[1];
    // UTF-16 LE BOM: FF FE
    // UTF-16 BE BOM: FE FF
    if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0xfe && b1 === 0xff)) {
      throw new Error("UTF-8 以外のファイルは現在サポートされていません");
    }
  }

  // Strip UTF-8 BOM (EF BB BF) if present
  let start = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    start = 3;
  }

  // Fatal decode: invalid byte sequences (Shift_JIS, EUC-JP, BOM-less UTF-16,
  // arbitrary binary, etc.) throw a TypeError instead of being silently
  // replaced with U+FFFD. Silent replacement previously corrupted non-UTF-8
  // manuscripts on save (#1888). We map the TypeError to the same Japanese
  // error used for non-UTF-8 BOM rejection so callers can refuse to open the
  // file rather than create an editable tab full of replacement characters.
  //
  // NOTE: this is intentionally NOT a "contains U+FFFD" string check — valid
  // UTF-8 content may legitimately include U+FFFD, and such documents must
  // still open and save. Fatal decoding only throws on genuinely invalid byte
  // sequences, which is the correct discriminator.
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf.slice(start));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("UTF-8 以外のファイルは現在サポートされていません");
    }
    throw error;
  }

  // Detect EOL style before normalization
  const eol: "lf" | "crlf" = /\r\n/.test(text) ? "crlf" : "lf";

  // Normalize to LF in memory; restore on write if needed
  return { text: text.replace(/\r\n/g, "\n"), eol };
}

/**
 * Encode text to bytes, restoring the original EOL style.
 *
 * BOM is NOT written — 1.2.10 simplification (no round-trip BOM).
 *
 * @param text - Text with LF line endings (normalized in memory)
 * @param eol - EOL style to restore ("lf" or "crlf")
 * @returns UTF-8 encoded bytes without BOM
 */
export function writeTextPreservingEol(text: string, eol: "lf" | "crlf"): Uint8Array {
  const normalized = eol === "crlf" ? text.replace(/\n/g, "\r\n") : text;
  return new TextEncoder().encode(normalized);
}
