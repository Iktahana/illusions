import type { LlmModelEntry } from "./types";

export const LLM_MODEL_REGISTRY: readonly LlmModelEntry[] = [
  {
    id: "qwen3-0.6b-q8",
    name: "Qwen3 0.6B (Q8_0)",
    nameJa: "Qwen3 0.6B（軽量）",
    url: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf",
    fileName: "Qwen3-0.6B-Q8_0.gguf",
    size: 596_049_920,
    sha256: "",
    quantization: "Q8_0",
    minRamMb: 1024,
  },
  {
    id: "qwen3-1.7b-q8",
    name: "Qwen3 1.7B (Q8_0)",
    nameJa: "Qwen3 1.7B（推奨）",
    url: "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf",
    fileName: "Qwen3-1.7B-Q8_0.gguf",
    size: 1_720_574_976,
    sha256: "",
    quantization: "Q8_0",
    minRamMb: 3072,
    recommended: true,
  },
  {
    id: "qwen3-4b-q4km",
    name: "Qwen3 4B (Q4_K_M)",
    nameJa: "Qwen3 4B（高精度）",
    url: "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
    fileName: "Qwen3-4B-Q4_K_M.gguf",
    size: 2_500_000_000,
    sha256: "",
    quantization: "Q4_K_M",
    minRamMb: 4096,
  },
] as const;

export function getModelEntry(modelId: string): LlmModelEntry | undefined {
  return LLM_MODEL_REGISTRY.find((m) => m.id === modelId);
}

export const DEFAULT_MODEL_ID = "qwen3-1.7b-q8";
