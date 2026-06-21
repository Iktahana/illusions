// Shared fatal UTF-8 decode for main-process user-document reads (#1888).
//
// Node's `fs.readFile(path, "utf-8")` decodes with a *non-fatal* TextDecoder:
// invalid byte sequences (Shift_JIS, EUC-JP, BOM-less UTF-16, arbitrary binary)
// are silently replaced with U+FFFD. Opening such a manuscript and saving then
// writes the lossy U+FFFD content back over the original file, destroying it.
//
// This helper decodes the same bytes with a *fatal* TextDecoder so genuinely
// non-UTF-8 input throws instead of being silently corrupted. The thrown error
// carries `code: "NON_UTF8"` and a Japanese message so the renderer can refuse
// to open the file (no editable tab) instead of round-tripping garbage.
//
// Mirrors the discriminator in shared/lib/text-codec.ts: it is NOT a naive
// "contains U+FFFD" check — valid UTF-8 documents may legitimately contain
// U+FFFD and must still open and save. Only invalid byte sequences throw.

const fsPromises = require("fs/promises");

/**
 * Strip a leading UTF-8 BOM (U+FEFF) from a decoded string.
 * @param {string} content - String decoded from a UTF-8 file
 * @returns {string} Content with the leading BOM removed if present
 */
function stripBom(content) {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

/**
 * Decode a raw byte buffer as strict UTF-8, throwing on invalid sequences.
 *
 * @param {Buffer | Uint8Array} buf - Raw file bytes
 * @returns {string} The decoded, BOM-stripped UTF-8 text
 * @throws {Error} with `code: "NON_UTF8"` when the bytes are not valid UTF-8
 */
function decodeUtf8Strict(buf) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch (error) {
    if (error instanceof TypeError) {
      const err = new Error("UTF-8 以外のファイルは現在サポートされていません");
      err.code = "NON_UTF8";
      throw err;
    }
    throw error;
  }
  return stripBom(text);
}

/**
 * Read a user-document file as strict UTF-8 text.
 *
 * Replaces lossy `fs.readFile(path, "utf-8")` for manuscript reads: reads raw
 * bytes and validates them through {@link decodeUtf8Strict}, throwing on any
 * non-UTF-8 input so the caller never writes corrupted content back (#1888).
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<string>} The decoded, BOM-stripped UTF-8 text
 * @throws {Error} with `code: "NON_UTF8"` when the file is not valid UTF-8
 */
async function readFileStrictUtf8(filePath) {
  const buf = await fsPromises.readFile(filePath);
  return decodeUtf8Strict(buf);
}

module.exports = { stripBom, decodeUtf8Strict, readFileStrictUtf8 };
