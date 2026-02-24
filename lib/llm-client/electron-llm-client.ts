/**
 * Electron LLM Client
 *
 * Communicates with Electron main process via IPC for LLM operations.
 * Requires window.electronAPI.llm to be exposed by preload script.
 */

import type { ILlmClient, LlmModelInfo, LlmInferenceResult } from "./types";

export class ElectronLlmClient implements ILlmClient {
  isAvailable(): boolean {
    return !!(
      typeof window !== "undefined" &&
      window.electronAPI?.llm
    );
  }

  async getModels(): Promise<LlmModelInfo[]> {
    if (!window.electronAPI?.llm) throw new Error("LLM not available");
    return window.electronAPI.llm.getModels();
  }

  async downloadModel(
    modelId: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    if (!window.electronAPI?.llm) throw new Error("LLM not available");
    let removeListener: (() => void) | undefined;
    if (onProgress) {
      removeListener = window.electronAPI.llm.onDownloadProgress((data) => {
        if (data.modelId === modelId) {
          onProgress(data.progress);
        }
      });
    }
    try {
      await window.electronAPI.llm.downloadModel(modelId);
    } finally {
      if (removeListener) {
        removeListener();
      }
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    if (!window.electronAPI?.llm) throw new Error("LLM not available");
    return window.electronAPI.llm.deleteModel(modelId);
  }

  async loadModel(modelId: string): Promise<void> {
    if (!window.electronAPI?.llm) throw new Error("LLM not available");
    return window.electronAPI.llm.loadModel(modelId);
  }

  async unloadModel(): Promise<void> {
    if (!window.electronAPI?.llm) throw new Error("LLM not available");
    return window.electronAPI.llm.unloadModel();
  }

  async isModelLoaded(): Promise<boolean> {
    if (!window.electronAPI?.llm) return false;
    return window.electronAPI.llm.isModelLoaded();
  }

  async infer(
    prompt: string,
    options?: { signal?: AbortSignal; maxTokens?: number },
  ): Promise<LlmInferenceResult> {
    if (!window.electronAPI?.llm) throw new Error("LLM not available");
    window.dispatchEvent(new Event("llm:inference-start"));
    try {
      // AbortSignal cannot cross IPC boundary directly - handled at engine level
      return await window.electronAPI.llm.infer(prompt, {
        maxTokens: options?.maxTokens,
      });
    } finally {
      window.dispatchEvent(new Event("llm:inference-end"));
    }
  }

  async inferBatch(
    prompts: string[],
    options?: { signal?: AbortSignal; maxTokens?: number },
  ): Promise<LlmInferenceResult[]> {
    if (!window.electronAPI?.llm) throw new Error("LLM not available");
    window.dispatchEvent(new Event("llm:inference-start"));
    try {
      // AbortSignal cannot cross IPC boundary directly
      return await window.electronAPI.llm.inferBatch(prompts, {
        maxTokens: options?.maxTokens,
      });
    } finally {
      window.dispatchEvent(new Event("llm:inference-end"));
    }
  }

  async getStorageUsage(): Promise<{
    used: number;
    models: Array<{ id: string; size: number }>;
  }> {
    if (!window.electronAPI?.llm) throw new Error("LLM not available");
    return window.electronAPI.llm.getStorageUsage();
  }

  async setIdlingStop(enabled: boolean): Promise<void> {
    if (!window.electronAPI?.llm) throw new Error("LLM not available");
    return window.electronAPI.llm.setIdlingStop(enabled);
  }
}
