# LLM Engine Documentation

Dual-engine AI proofreading architecture for the illusions editor.

---

## Overview

The LLM Engine provides AI-powered text analysis and proofreading through a dual-engine architecture:

- **Local engine**: Runs Qwen3 GGUF models via `node-llama-cpp` entirely on-device. No internet required. Three model sizes available (0.6B, 1.7B, 4B parameters).
- **Online engine**: Connects to an OpenAI-compatible API endpoint for cloud-based inference. Supports GPT-4o and GPT-4o-mini.
- **LlmManager**: Unified routing layer that directs requests to the appropriate engine based on model ID. Handles model lifecycle (load, unload, idle timeout).

### Key Files

| File | Purpose |
|------|---------|
| `llm-service/llm-engine.js` | Local inference engine (node-llama-cpp) |
| `llm-service/online-llm-engine.js` | Online inference engine (OpenAI-compatible API) |
| `llm-service/llm-manager.js` | Unified manager routing local/online requests |
| `llm-service/llm-ipc-handlers.js` | Electron IPC handlers for all LLM operations |
| `lib/llm-client/` | Client-side interface and factory (`getLlmClient()`) |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│               Application (React/Next.js)                        │
│                 Uses: getLlmClient()                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│             LLM Client (lib/llm-client/)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ILlmClient interface                                     │  │
│  │  getLlmClient() — factory (Electron or Web stub)          │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────────────────────┘
               │
     ┌─────────┴──────────────────────────────────────┐
     │  Electron?  YES                                │  Web?
     │                                                │  WebLlmClient
     ▼                                                │  isAvailable() = false
┌──────────────────────┐                              │
│  ElectronLlmClient   │                              │
│                      │                              │
│  ipcRenderer.invoke  │                              │
│  llm:* channels      │                              │
│                      │                              │
│  Dispatches window   │                              │
│  events:             │                              │
│  - llm:inference-    │                              │
│    start             │                              │
│  - llm:inference-    │                              │
│    end               │                              │
└──────────┬───────────┘
           │ IPC
           ▼
┌──────────────────────────────────────────────────────────────┐
│  Electron Main Process                                        │
│  (llm-ipc-handlers.js)                                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  LlmManager (llm-manager.js)                            │ │
│  │                                                          │ │
│  │  Routes by model ID:                                     │ │
│  │  - local models → LlmEngine                              │ │
│  │  - online models → OnlineLlmEngine                       │ │
│  │                                                          │ │
│  │  loadModel() — unloads previous model first              │ │
│  │  getModels() — merges both engines' model lists          │ │
│  └──────────┬──────────────────────┬────────────────────────┘ │
│             │                      │                          │
│    ┌────────┴────────┐    ┌────────┴──────────┐              │
│    ▼                 │    ▼                    │              │
│  ┌────────────────────┐  ┌──────────────────────┐            │
│  │  LlmEngine        │  │  OnlineLlmEngine     │            │
│  │  (llm-engine.js)  │  │  (online-llm-        │            │
│  │                    │  │   engine.js)          │            │
│  │  node-llama-cpp    │  │                      │            │
│  │                    │  │  OpenAI-compatible    │            │
│  │  Qwen3 GGUF       │  │  API client           │            │
│  │  models            │  │                      │            │
│  │                    │  │  Models:             │            │
│  │  Promise queue     │  │  - gpt-4o            │            │
│  │  (serialized       │  │  - gpt-4o-mini       │            │
│  │   inference)       │  │                      │            │
│  │                    │  │  temp=0.7            │            │
│  │  Idle auto-unload  │  │  max_tokens=1024     │            │
│  │  (30s timer)       │  │                      │            │
│  └────────────────────┘  └──────────────────────┘            │
│                                                               │
│  Model Storage:                                               │
│  macOS:   ~/Library/Application Support/illusions/models/     │
│  Windows: %APPDATA%\illusions\models\                         │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Interfaces

### `ILlmClient` (Client-side)

```typescript
interface ILlmClient {
  isAvailable(): boolean;
  getModels(): Promise<LlmModelInfo[]>;
  downloadModel(modelId: string): Promise<void>;
  deleteModel(modelId: string): Promise<void>;
  loadModel(modelId: string): Promise<void>;
  unloadModel(): Promise<void>;
  isModelLoaded(): Promise<boolean>;
  infer(prompt: string): Promise<string>;
  getStorageUsage(): Promise<LlmStorageUsage>;
}
```

### Model Registry

Three local Qwen3 GGUF models are available:

| Model ID | Size | Quantization | Notes |
|----------|------|--------------|-------|
| `qwen3-0.6b-q8` | ~610 MB | Q8_0 | Lightweight, fast inference |
| `qwen3-1.7b-q8` | ~1.7 GB | Q8_0 | **Recommended (default)** |
| `qwen3-4b-q4km` | ~2.4 GB | Q4_K_M | High precision |

Online models (via OpenAI-compatible API):

| Model ID | Notes |
|----------|-------|
| `gpt-4o` | Full-capability cloud model |
| `gpt-4o-mini` | Faster, lower-cost variant |

---

## Code Examples

### Basic Inference

```typescript
import { getLlmClient } from "@/lib/llm-client";

const llm = getLlmClient();

if (llm.isAvailable()) {
  // Load a model (unloads any previously loaded model)
  await llm.loadModel("qwen3-1.7b-q8");

  // Run inference
  const result = await llm.infer("Proofread this text: ...");
  console.log(result);

  // Unload when done
  await llm.unloadModel();
}
```

### Download and Manage Models

```typescript
const llm = getLlmClient();

// List all available models (local + online)
const models = await llm.getModels();
for (const model of models) {
  console.log(`${model.id}: ${model.downloaded ? "Ready" : "Not downloaded"}`);
}

// Download a model (with resume support)
await llm.downloadModel("qwen3-1.7b-q8");

// Check storage usage
const usage = await llm.getStorageUsage();
console.log(`Models using ${usage.totalBytes} bytes`);

// Delete a model to free space
await llm.deleteModel("qwen3-0.6b-q8");
```

### Listen for Inference Events (Electron Renderer)

```typescript
// ElectronLlmClient dispatches window events during inference
window.addEventListener("llm:inference-start", () => {
  showLoadingIndicator();
});

window.addEventListener("llm:inference-end", () => {
  hideLoadingIndicator();
});
```

---

## IPC Channels

All IPC channels use the `llm:` prefix.

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `llm:get-models` | Renderer -> Main | List all available models (local + online) |
| `llm:download-model` | Renderer -> Main | Download a local model to disk |
| `llm:download-progress` | Main -> Renderer | Progress callback during download |
| `llm:delete-model` | Renderer -> Main | Delete a downloaded model |
| `llm:load-model` | Renderer -> Main | Load model into memory for inference |
| `llm:unload-model` | Renderer -> Main | Unload model from memory |
| `llm:is-model-loaded` | Renderer -> Main | Check if a model is currently loaded |
| `llm:infer` | Renderer -> Main | Run inference (max 100,000 characters input) |
| `llm:get-storage-usage` | Renderer -> Main | Get total model storage on disk |
| `llm:set-idling-stop` | Renderer -> Main | Enable/disable idle auto-unload |

---

## Local Engine Internals

### Download Flow

1. **HTTP Range support**: Downloads can resume after interruption.
2. **SHA-256 verification**: Downloaded file is verified against the expected hash.
3. **Atomic rename**: File is written to a `.tmp` path, then renamed to its final location only after verification succeeds.
4. **Progress callback**: `llm:download-progress` events are sent to the renderer during download.

### Inference Serialization

The local engine maintains a single `LlamaContext` sequence. All inference requests are serialized through a promise queue to prevent concurrent access:

```
Request A ─┐
            ├─→ [Promise Queue] ─→ LlamaContext (one at a time)
Request B ─┘
```

An `#inferring` counter tracks active inference operations. While `#inferring > 0`, model unload requests are blocked to prevent resource disposal during inference.

### Idle Auto-Unload

To conserve memory, the local engine automatically unloads the model after 30 seconds of inactivity:

- **Timer starts**: When the last inference completes (`#inferring` reaches 0).
- **Timer cancels**: When a new inference request arrives.
- **Unload sequence**: Dispose `LlamaContext` and model, then call `global.gc()` to reclaim memory.

The idle timer can be disabled via the `llm:set-idling-stop` IPC channel.

---

## Online Engine

The online engine connects to an OpenAI-compatible API endpoint:

- **Base URL**: Configurable (defaults to OpenAI API).
- **Authentication**: API key stored securely (not hardcoded).
- **Parameters**: Temperature 0.7, max_tokens 1024.
- **Models**: `gpt-4o`, `gpt-4o-mini`.

The online engine is stateless -- no model loading or unloading is required. It is always available when an API key is configured.

---

## Storage Locations

Model files are stored in the platform-specific application data directory:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/illusions/models/` |
| Windows | `%APPDATA%\illusions\models\` |

Each model file is a GGUF binary named by its model ID (e.g., `qwen3-1.7b-q8.gguf`).

---

## Related Documents

- [Storage Service](./storage-system.md) -- Persistence layer for app state and settings
- [NLP Backend](./nlp-backend-architecture.md) -- Morphological analysis (kuromoji) used alongside LLM proofreading
- [Notification System](./notification-system.md) -- Displays LLM inference results and download progress to users

---

**Last Updated**: 2026-02-25
**Version**: 1.0.0
