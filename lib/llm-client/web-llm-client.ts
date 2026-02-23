/**
 * Web LLM Client (Stub)
 *
 * LLM features are only available in the Electron desktop app.
 * This stub returns false for isAvailable() and throws for all operations.
 */

import type { ILlmClient, LlmModelInfo, LlmInferenceResult } from "./types";

const UNAVAILABLE_MESSAGE = "デスクトップアプリでのみ利用可能";

export class WebLlmClient implements ILlmClient {
  isAvailable(): boolean {
    return false;
  }

  async getModels(): Promise<LlmModelInfo[]> {
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  async downloadModel(): Promise<void> {
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  async deleteModel(): Promise<void> {
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  async loadModel(): Promise<void> {
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  async unloadModel(): Promise<void> {
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  async isModelLoaded(): Promise<boolean> {
    return false;
  }

  async infer(): Promise<LlmInferenceResult> {
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  async getStorageUsage(): Promise<{
    used: number;
    models: Array<{ id: string; size: number }>;
  }> {
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  // no-op in web environment
  async setIdlingStop(_enabled: boolean): Promise<void> {
    // no-op
  }
}
