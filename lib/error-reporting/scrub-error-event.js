const WINDOWS_PATH_RE = /[A-Za-z]:\\(?:[^\\\s:]+\\)*[^\\\s:]+/g;
const POSIX_PATH_RE = /\/(?:[^/\s:]+\/)+[^/\s:]+/g;
const FILE_NAME_RE = /([^/\\\s:]+)\.(mdi|md|txt|docx|pdf|epub)\b/gi;

function sanitizeMatchedPath(match, separator) {
  const leaf = match.split(separator).pop() || "";
  const fileMatch = leaf.match(/\.([A-Za-z0-9]+)$/);
  if (fileMatch) {
    return `[path]${separator}[file].${fileMatch[1]}`;
  }
  return "[path]";
}

function sanitizePathLike(value) {
  return value
    .replace(WINDOWS_PATH_RE, (match) => sanitizeMatchedPath(match, "\\"))
    .replace(POSIX_PATH_RE, (match) => sanitizeMatchedPath(match, "/"));
}

function sanitizeFileNames(value) {
  return value.replace(FILE_NAME_RE, (_match, _base, ext) => `[file].${ext.toLowerCase()}`);
}

function sanitizeErrorText(value) {
  return sanitizeFileNames(sanitizePathLike(value));
}

function sanitizeUnknown(value) {
  if (typeof value === "string") return sanitizeErrorText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeUnknown(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, sanitizeUnknown(inner)]),
    );
  }
  return value;
}

function scrubSentryEvent(event) {
  const scrubbed = sanitizeUnknown(event);
  delete scrubbed.user;
  delete scrubbed.request;
  delete scrubbed.breadcrumbs;
  return scrubbed;
}

function scrubRendererErrorPayload(payload) {
  return {
    ...payload,
    name: payload.name ? sanitizeErrorText(payload.name) : payload.name,
    message: payload.message ? sanitizeErrorText(payload.message) : payload.message,
    stack: payload.stack ? sanitizeErrorText(payload.stack) : payload.stack,
  };
}

module.exports = {
  sanitizeErrorText,
  scrubSentryEvent,
  scrubRendererErrorPayload,
};
