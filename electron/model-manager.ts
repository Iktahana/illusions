/**
 * Model manager: download, store, and list GGUF models under userData/models.
 * Used by the main process for local AI proofreading.
 */

import { app } from "electron";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import axios from "axios";

export interface ModelMetadata {
  name: string;
  path: string;
}

const MODELS_DIR_NAME = "models";
const META_FILE = "models.json";

function getModelsDir(): string {
  const userData = app.getPath("userData");
  return path.join(userData, MODELS_DIR_NAME);
}

function getMetaPath(): string {
  return path.join(getModelsDir(), META_FILE);
}

/**
 * Ensure the models directory exists.
 */
async function ensureModelsDir(): Promise<void> {
  const dir = getModelsDir();
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Load metadata from models.json. Returns empty array if missing or invalid.
 */
async function loadMeta(): Promise<Record<string, { sourceUrl?: string; downloadedAt?: string }>> {
  try {
    const p = getMetaPath();
    const raw = await fs.readFile(p, "utf-8");
    const data = JSON.parse(raw) as Record<string, { sourceUrl?: string; downloadedAt?: string }>;
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {};
  }
}

/**
 * Save metadata to models.json.
 */
async function saveMeta(meta: Record<string, { sourceUrl?: string; downloadedAt?: string }>): Promise<void> {
  await ensureModelsDir();
  const p = getMetaPath();
  await fs.writeFile(p, JSON.stringify(meta, null, 2), "utf-8");
}

/**
 * Get the full path for a model file. Uses modelName as filename (adds .gguf if missing).
 */
export function getModelPath(modelName: string): string {
  const base = modelName.endsWith(".gguf") ? modelName : `${modelName}.gguf`;
  return path.join(getModelsDir(), base);
}

/**
 * Check whether a model file exists.
 */
export async function checkModelExists(modelName: string): Promise<boolean> {
  try {
    const p = getModelPath(modelName);
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all models (and optional metadata) in the models directory.
 */
export async function listModels(): Promise<ModelMetadata[]> {
  await ensureModelsDir();
  const dir = getModelsDir();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const meta = await loadMeta();
  const result: ModelMetadata[] = [];

  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".gguf")) continue;
    const fullPath = path.join(dir, e.name);
    const name = e.name;
    result.push({ name, path: fullPath });
  }

  return result;
}

/**
 * Download a model from URL to userData/models, report progress via callback.
 * Uses axios streaming. Progress is 0–100.
 *
 * @param url - Direct download URL (e.g. Hugging Face resolve/main/...).
 * @param modelName - Local name (used as filename; .gguf added if missing).
 * @param onProgress - Called with progress percent 0–100.
 * @returns Full path to the downloaded model file.
 */
export async function downloadModel(
  url: string,
  modelName: string,
  onProgress: (percent: number) => void
): Promise<string> {
  await ensureModelsDir();

  const outputPath = getModelPath(modelName);
  const fileName = path.basename(outputPath);

  const { data, headers } = await axios({
    method: "get",
    url,
    responseType: "stream",
    timeout: 600_000,
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const total = Number(headers["content-length"]) || 0;
  let downloaded = 0;

  const writer = fsSync.createWriteStream(outputPath, { flags: "w" });

  await new Promise<void>((resolve, reject) => {
    data.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
      onProgress(pct);
    });
    data.on("error", reject);
    data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  onProgress(100);

  const meta = await loadMeta();
  const key = fileName;
  meta[key] = {
    sourceUrl: url,
    downloadedAt: new Date().toISOString(),
  };
  await saveMeta(meta);

  return outputPath;
}
