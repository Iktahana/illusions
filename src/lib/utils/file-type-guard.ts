/**
 * File-type guard for external file drop operations.
 *
 * Determines whether a File (from a DataTransfer / FileList) can safely be
 * imported into the project as a UTF-8 text document. Binary formats such as
 * PDF, DOCX, PNG, JPEG, etc. must NOT be passed through `File.text()` because
 * the UTF-8 decode step silently replaces invalid bytes with U+FFFD, producing
 * a corrupted copy that looks intact in the UI.
 *
 * Guard logic (both checks must pass):
 * 1. Extension allowlist  — file name ends with a known text extension, or
 *    has no extension at all (bare filenames are assumed to be plain text).
 * 2. MIME denylist        — file.type does NOT start with a known binary
 *    MIME prefix, unless the browser reports an empty string (common when
 *    dragging from Finder for unknown extensions).
 *
 * These checks are conservative: when in doubt we deny rather than corrupt.
 * See issue #1880 for the original bug report.
 */

/** Extensions that the editor can open as UTF-8 text. */
export const TEXT_EXTENSIONS = [".mdi", ".md", ".txt"] as const;

/**
 * MIME type prefixes that are definitively binary. Anything matching these
 * is rejected regardless of file extension.
 */
const BINARY_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "application/zip",
  "application/x-zip",
  "application/vnd.openxmlformats", // .docx / .xlsx / .pptx
  "application/vnd.ms-", // .doc / .xls / .ppt
  "application/vnd.oasis", // LibreOffice ODF formats
  "application/octet-stream",
  "application/x-bzip",
  "application/x-rar",
  "application/x-tar",
  "application/x-7z",
  "font/",
] as const;

/**
 * Return the lowercased dotted extension (".txt") from a filename, or ""
 * when the name has no dot.
 */
export function extractFileExtension(name: string): string {
  if (!name.includes(".")) return "";
  return "." + (name.split(".").pop() ?? "").toLowerCase();
}

/**
 * Return true if this File should be imported as UTF-8 text, false if it is
 * a known binary format and must be rejected.
 *
 * @param file - Browser File object from a DataTransfer
 */
export function isTextDroppable(file: File): boolean {
  const ext = extractFileExtension(file.name);
  const mime = file.type.toLowerCase();

  // Extension check: if there is an extension it must be in the allowlist.
  // No extension (bare filenames like "README") → allowed.
  if (ext !== "" && !(TEXT_EXTENSIONS as readonly string[]).includes(ext)) {
    return false;
  }

  // MIME check: reject any known-binary MIME prefix.
  // Empty MIME ("") means the browser doesn't know — we fall through to the
  // extension decision already made above.
  if (mime !== "" && BINARY_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    return false;
  }

  return true;
}
