import type { RendererErrorPayload } from "./error-reporting-types";

const WINDOWS_PATH_RE = /[A-Za-z]:\\(?:[^\\\s:]+\\)*[^\\\s:]+/g;
const POSIX_PATH_RE = /(?<![A-Za-z0-9_.\]-])\/(?:[^/\s:]+\/)+[^/\s:]+/g;
const FILE_NAME_RE = /([^/\\\s:]+)\.(mdi|md|txt|docx|pdf|epub)\b/gi;
const SOURCE_CODE_EXTENSIONS = new Set(["cjs", "cts", "js", "jsx", "mjs", "mts", "ts", "tsx"]);
const PROJECT_PATH_ANCHORS = new Set([
  "app",
  "components",
  "contexts",
  "electron",
  "lib",
  "packages",
  "platform",
  "scripts",
  "shared",
  "types",
]);

function sanitizePathLike(value: string): string {
  return value
    .replace(WINDOWS_PATH_RE, (match) => sanitizeMatchedPath(match, "\\"))
    .replace(POSIX_PATH_RE, (match) => sanitizeMatchedPath(match, "/"));
}

function sanitizeMatchedPath(match: string, separator: "/" | "\\"): string {
  const leaf = match.split(separator).pop() ?? "";
  const fileMatch = leaf.match(/\.([A-Za-z0-9]+)$/);
  if (fileMatch) {
    const extension = fileMatch[1].toLowerCase();
    if (SOURCE_CODE_EXTENSIONS.has(extension)) {
      return sourcePathLabel(match, separator, leaf);
    }
    return `[path]${separator}[file].${fileMatch[1]}`;
  }
  return "[path]";
}

function sourcePathLabel(match: string, separator: "/" | "\\", leaf: string): string {
  const segments = match.split(separator).filter(Boolean);
  const anchorIndex = segments.findIndex((segment) =>
    PROJECT_PATH_ANCHORS.has(segment.toLowerCase()),
  );
  if (anchorIndex >= 0) {
    return segments.slice(anchorIndex).join("/");
  }
  return `[path]${separator}${leaf}`;
}

function sanitizeFileNames(value: string): string {
  return value.replace(FILE_NAME_RE, (_match, _base, ext: string) => `[file].${ext.toLowerCase()}`);
}

export function sanitizeErrorText(value: string): string {
  return sanitizeFileNames(sanitizePathLike(value));
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") return sanitizeErrorText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeUnknown(item));
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, inner]) => [key, sanitizeUnknown(inner)]);
    return Object.fromEntries(entries);
  }
  return value;
}

export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T | null {
  const scrubbed = sanitizeUnknown(event) as T;

  delete (scrubbed as Record<string, unknown>).user;
  delete (scrubbed as Record<string, unknown>).request;
  delete (scrubbed as Record<string, unknown>).breadcrumbs;

  return scrubbed;
}

export function scrubRendererErrorPayload(payload: RendererErrorPayload): RendererErrorPayload {
  return {
    ...payload,
    name: payload.name ? sanitizeErrorText(payload.name) : payload.name,
    message: payload.message ? sanitizeErrorText(payload.message) : payload.message,
    stack: payload.stack ? sanitizeErrorText(payload.stack) : payload.stack,
  };
}
