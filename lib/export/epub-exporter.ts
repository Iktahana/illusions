/**
 * EPUB 3 exporter for MDI content (Node.js / Electron only)
 *
 * Uses Node.js streams and the archiver library to build the EPUB ZIP archive.
 * For browser environments, use epub-web.ts instead.
 */

import archiver from "archiver";
import { PassThrough } from "node:stream";

import { buildEpubFiles } from "./epub-shared";
import type { EpubExportOptions } from "./epub-shared";

export type { EpubExportOptions };

/**
 * Generate an EPUB buffer from MDI markdown content.
 *
 * @param content - MDI markdown content
 * @param options - EPUB export options
 * @returns EPUB data as a Buffer
 */
export async function generateEpub(content: string, options: EpubExportOptions): Promise<Buffer> {
  const files = buildEpubFiles(content, options);

  // Create ZIP archive
  const archive = archiver("zip", { zlib: { level: 9 } });
  const buffers: Buffer[] = [];
  const passThrough = new PassThrough();

  passThrough.on("data", (chunk: Buffer) => buffers.push(chunk));
  archive.pipe(passThrough);

  for (const [path, stringContent] of files) {
    // mimetype must be stored uncompressed per EPUB spec
    const store = path === "mimetype";
    archive.append(stringContent, { name: path, store });
  }

  // Attach completion listeners BEFORE finalize to avoid race condition.
  // archiver may emit "end" synchronously during finalize(), so the
  // listener must already be in place.
  const done = new Promise<void>((resolve, reject) => {
    passThrough.on("end", resolve);
    passThrough.on("error", reject);
    archive.on("error", reject);
  });

  await archive.finalize();
  await done;

  return Buffer.concat(buffers);
}
