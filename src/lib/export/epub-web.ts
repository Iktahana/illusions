/**
 * EPUB 3 exporter for browser environments
 *
 * Uses fflate (browser-compatible ZIP library) to build the EPUB archive.
 * For Node.js / Electron environments, use epub-exporter.ts instead.
 *
 * EPUB spec compliance:
 * - "mimetype" entry must be first in the ZIP and stored uncompressed (method=0)
 * - buildEpubFiles() returns a Map that guarantees mimetype is the first entry
 */

import { zipSync } from "fflate";
import type { ZipOptions } from "fflate";

import { buildEpubFiles } from "./epub-shared";
import type { EpubExportOptions } from "./epub-shared";

export type { EpubExportOptions };

/**
 * Generate an EPUB Blob from MDI markdown content (browser-only).
 *
 * @param content - MDI markdown content
 * @param options - EPUB export options
 * @returns EPUB data as a Blob
 */
export async function generateEpubBlob(content: string, options: EpubExportOptions): Promise<Blob> {
  const fileMap = buildEpubFiles(content, options);

  // Build fflate input as Record<path, [Uint8Array, per-file options]>
  // Preserving Map insertion order ensures "mimetype" is the first entry.
  const zipInput: Record<string, [Uint8Array, ZipOptions]> = {};

  // Explicitly construct Uint8Array via TextEncoder to ensure fflate's internal
  // instanceof checks pass. (fflate's strToU8 uses a cached TextEncoder whose
  // output may fail instanceof in jsdom/vitest environments.)
  const encode = (s: string): Uint8Array => new Uint8Array(new TextEncoder().encode(s));

  for (const [path, fileContent] of fileMap) {
    // mimetype must be stored uncompressed (level: 0) per EPUB spec
    const isMimetype = path === "mimetype";
    const data = fileContent instanceof Uint8Array ? fileContent : encode(fileContent);
    zipInput[path] = [data, { level: isMimetype ? 0 : 9 }];
  }

  const zipped = zipSync(zipInput);
  // Copy into a plain ArrayBuffer to satisfy Blob constructor type constraints.
  // (fflate may return a Uint8Array backed by SharedArrayBuffer in some environments)
  const arrayBuffer = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(arrayBuffer).set(zipped);
  return new Blob([arrayBuffer], { type: "application/epub+zip" });
}
