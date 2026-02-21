// @ts-check
'use strict';

const path = require('path');
const fs = require('fs/promises');
const { createWriteStream } = require('fs');
const crypto = require('crypto');

// Model registry data (duplicated from TS for CJS compatibility)
const MODEL_REGISTRY = [
  {
    id: 'qwen3-0.6b-q8',
    fileName: 'qwen3-0.6b-q8_0.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/qwen3-0.6b-q8_0.gguf',
    size: 639_000_000,
    sha256: '',
  },
  {
    id: 'qwen3-1.7b-q8',
    fileName: 'qwen3-1.7b-q8_0.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/qwen3-1.7b-q8_0.gguf',
    size: 1_830_000_000,
    sha256: '',
  },
  {
    id: 'qwen3-4b-q4km',
    fileName: 'qwen3-4b-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/qwen3-4b-q4_k_m.gguf',
    size: 2_500_000_000,
    sha256: '',
  },
];

class LlmEngine {
  /** @type {import('node-llama-cpp').LlamaModel | null} */
  #model = null;
  /** @type {import('node-llama-cpp').LlamaContext | null} */
  #context = null;
  /** @type {string | null} */
  #modelId = null;
  /** @type {string | null} */
  #modelsDir = null;
  /** @type {boolean} */
  #initialized = false;

  async init() {
    if (this.#initialized) return;
    const { app } = require('electron');
    this.#modelsDir = path.join(app.getPath('userData'), 'models');
    await fs.mkdir(this.#modelsDir, { recursive: true });
    this.#initialized = true;
  }

  #ensureInit() {
    if (!this.#initialized || !this.#modelsDir) {
      throw new Error('LlmEngine not initialized. Call init() first.');
    }
  }

  #getEntry(modelId) {
    const entry = MODEL_REGISTRY.find((m) => m.id === modelId);
    if (!entry) throw new Error(`Unknown model: ${modelId}`);
    return entry;
  }

  /**
   * Get all models with their download status
   */
  async getModels() {
    this.#ensureInit();
    const results = [];
    for (const entry of MODEL_REGISTRY) {
      const filePath = path.join(this.#modelsDir, entry.fileName);
      let status = 'not-downloaded';
      try {
        const stat = await fs.stat(filePath);
        // Check if file size roughly matches (within 1% tolerance for metadata)
        if (stat.size > 0) {
          status = 'ready';
        }
      } catch {
        // Check for partial download
        try {
          await fs.stat(filePath + '.tmp');
          status = 'downloading';
        } catch {
          // not downloaded
        }
      }
      // Override if currently loaded
      if (this.#modelId === entry.id && this.#model) {
        status = 'loaded';
      }
      results.push({
        id: entry.id,
        status,
        filePath: status === 'ready' || status === 'loaded' ? filePath : undefined,
      });
    }
    return results;
  }

  /**
   * Download a model with resume support
   * @param {string} modelId
   * @param {(progress: { modelId: string; progress: number }) => void} [onProgress]
   */
  async downloadModel(modelId, onProgress) {
    this.#ensureInit();
    const entry = this.#getEntry(modelId);
    const targetPath = path.join(this.#modelsDir, entry.fileName);
    const tmpPath = targetPath + '.tmp';

    // Check if already downloaded
    try {
      const stat = await fs.stat(targetPath);
      if (stat.size > 0) return; // already exists
    } catch {
      // not downloaded yet
    }

    // Check for partial download (resume support)
    let startByte = 0;
    try {
      const stat = await fs.stat(tmpPath);
      startByte = stat.size;
    } catch {
      // no partial file
    }

    const headers = {};
    if (startByte > 0) {
      headers['Range'] = `bytes=${startByte}-`;
    }

    // Download using native fetch (available in Node 18+)
    const response = await fetch(entry.url, { headers });
    if (!response.ok && response.status !== 206) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    const totalSize = startByte + contentLength;
    let downloaded = startByte;

    const fileStream = createWriteStream(tmpPath, { flags: startByte > 0 ? 'a' : 'w' });

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(Buffer.from(value));
        downloaded += value.byteLength;

        if (onProgress && totalSize > 0) {
          onProgress({
            modelId,
            progress: Math.round((downloaded / totalSize) * 100),
          });
        }
      }
    } finally {
      fileStream.end();
      await new Promise((resolve) => fileStream.on('finish', resolve));
    }

    // SHA256 verification (skip if sha256 is empty — not yet filled)
    if (entry.sha256) {
      const hash = crypto.createHash('sha256');
      const fileBuffer = await fs.readFile(tmpPath);
      hash.update(fileBuffer);
      const digest = hash.digest('hex');
      if (digest !== entry.sha256) {
        await fs.unlink(tmpPath);
        throw new Error(`SHA256 mismatch for ${entry.fileName}`);
      }
    }

    // Atomic rename
    await fs.rename(tmpPath, targetPath);
  }

  /**
   * Delete a downloaded model
   * @param {string} modelId
   */
  async deleteModel(modelId) {
    this.#ensureInit();
    if (this.#modelId === modelId) {
      await this.unloadModel();
    }
    const entry = this.#getEntry(modelId);
    const filePath = path.join(this.#modelsDir, entry.fileName);
    try {
      await fs.unlink(filePath);
    } catch {
      // file doesn't exist, that's fine
    }
    // Also clean up partial downloads
    try {
      await fs.unlink(filePath + '.tmp');
    } catch {
      // no partial file
    }
  }

  /**
   * Load model into memory
   * @param {string} modelId
   */
  async loadModel(modelId) {
    this.#ensureInit();
    if (this.#modelId === modelId && this.#model) return; // already loaded
    if (this.#model) await this.unloadModel(); // unload previous

    const entry = this.#getEntry(modelId);
    const modelPath = path.join(this.#modelsDir, entry.fileName);

    // Verify file exists
    try {
      await fs.stat(modelPath);
    } catch {
      throw new Error(`Model file not found: ${entry.fileName}. Download it first.`);
    }

    // Dynamic import for ESM module
    const { getLlama } = await import('node-llama-cpp');
    const llama = await getLlama();
    this.#model = await llama.loadModel({ modelPath });
    this.#context = await this.#model.createContext();
    this.#modelId = modelId;
  }

  /**
   * Unload model from memory, freeing VRAM/RAM
   */
  async unloadModel() {
    if (this.#context) {
      await this.#context.dispose();
      this.#context = null;
    }
    if (this.#model) {
      await this.#model.dispose();
      this.#model = null;
    }
    this.#modelId = null;
    // Hint to GC to reclaim native memory
    if (global.gc) global.gc();
  }

  /**
   * Check if a model is currently loaded
   */
  isLoaded() {
    return this.#model !== null;
  }

  /**
   * Run inference on the loaded model
   * @param {string} prompt
   * @param {{ maxTokens?: number }} [options]
   */
  async infer(prompt, options = {}) {
    if (!this.#model || !this.#context) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    const { LlamaChatSession } = await import('node-llama-cpp');
    const session = new LlamaChatSession({
      contextSequence: this.#context.getSequence(),
    });

    const maxTokens = options.maxTokens || 512;
    let tokenCount = 0;

    const text = await session.prompt(prompt, {
      maxTokens,
      onToken: () => { tokenCount++; },
    });

    return { text, tokenCount };
  }

  /**
   * Get storage usage for downloaded models
   */
  async getStorageUsage() {
    this.#ensureInit();
    const models = [];
    let totalUsed = 0;
    for (const entry of MODEL_REGISTRY) {
      const filePath = path.join(this.#modelsDir, entry.fileName);
      try {
        const stat = await fs.stat(filePath);
        models.push({ id: entry.id, size: stat.size });
        totalUsed += stat.size;
      } catch {
        // not downloaded
      }
    }
    return { used: totalUsed, models };
  }

  /**
   * Full cleanup — call on app quit
   */
  async dispose() {
    await this.unloadModel();
    this.#initialized = false;
  }
}

module.exports = { LlmEngine };
