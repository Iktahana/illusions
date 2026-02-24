export interface LlmModelEntry {
  readonly id: string;
  readonly name: string;
  readonly nameJa: string;
  readonly descriptionJa?: string;
  readonly url: string;
  readonly fileName: string;
  readonly size: number;
  readonly sha256: string;
  readonly quantization: string;
  readonly minRamMb: number;
  readonly recommended?: boolean;
}

export interface LlmConfig {
  modelId: string;
  enabled: boolean;
}

export type LlmModelStatus =
  | "not-downloaded"
  | "downloading"
  | "ready"
  | "loading"
  | "loaded"
  | "error";

export interface LlmModelInfo {
  id: string;
  status: LlmModelStatus;
  downloadProgress?: number;
  filePath?: string;
  error?: string;
}

export interface LlmInferenceResult {
  text: string;
  tokenCount: number;
}

export interface ILlmClient {
  /** Check if LLM features are available in this environment */
  isAvailable(): boolean;

  /** Get list of available models with their download status */
  getModels(): Promise<LlmModelInfo[]>;

  /** Download a model with progress reporting */
  downloadModel(
    modelId: string,
    onProgress?: (progress: number) => void,
  ): Promise<void>;

  /** Delete a downloaded model */
  deleteModel(modelId: string): Promise<void>;

  /** Load model into memory (VRAM/RAM). Must be called before infer(). */
  loadModel(modelId: string): Promise<void>;

  /** Unload model from memory, freeing VRAM/RAM. */
  unloadModel(): Promise<void>;

  /** Check if a model is currently loaded */
  isModelLoaded(): Promise<boolean>;

  /** Run inference. Model must be loaded first. Supports AbortSignal for cancellation. */
  infer(
    prompt: string,
    options?: { signal?: AbortSignal; maxTokens?: number },
  ): Promise<LlmInferenceResult>;

  /** Get disk usage for downloaded models */
  getStorageUsage(): Promise<{
    used: number;
    models: Array<{ id: string; size: number }>;
  }>;

  /** Enable or disable automatic model unloading after idle timeout */
  setIdlingStop(enabled: boolean): Promise<void>;
}
