"use strict";
/**
 * URL policy for opening external links from the renderer (#1567 S3).
 *
 * setWindowOpenHandler passes renderer-controlled URLs to shell.openExternal,
 * which on macOS/Windows can launch arbitrary protocol handlers (file:,
 * smb:, javascript:, custom app schemes, ...). Only web URLs are allowed.
 *
 * Fail-closed: any URL that cannot be parsed by `new URL()` is denied.
 */

/** Protocols allowed to be opened in the default browser. */
const ALLOWED_EXTERNAL_PROTOCOLS = Object.freeze(["https:", "http:"]);

/**
 * Returns true only when the URL parses and its protocol is exactly
 * "https:" or "http:". Anything else (including parse failures) is denied.
 * @param {unknown} url
 * @returns {boolean}
 */
function isSafeExternalUrl(url) {
  if (typeof url !== "string") return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Fail closed on unparseable URLs
    return false;
  }
  // Defense in depth: require a hostname. Note WHATWG URL force-normalizes
  // special schemes ("http:evil.com" parses as "http://evil.com/", hostname
  // "evil.com"), so for http(s) this is currently always true when parsing
  // succeeded — the check guards against future relaxations of the allowlist.
  return ALLOWED_EXTERNAL_PROTOCOLS.includes(parsed.protocol) && parsed.hostname.length > 0;
}

/**
 * Normalized string form of a validated URL. Call only after
 * isSafeExternalUrl() returned true — opening the normalized form avoids
 * passing the raw renderer-controlled string to the OS.
 * @param {string} url
 * @returns {string}
 */
function normalizeExternalUrl(url) {
  return new URL(url).toString();
}

module.exports = { isSafeExternalUrl, normalizeExternalUrl, ALLOWED_EXTERNAL_PROTOCOLS };
