/**
 * AI proofreading engine using node-llama-cpp.
 * Loads a GGUF model and runs grammar/style correction via a chat session.
 *
 * Electron packaging: ensure `node-llama-cpp` is listed in `asarUnpack` in
 * electron-builder config so native binaries are not bundled inside asar.
 */

import {
  getLlama,
  LlamaChatSession,
  LlamaLogLevel,
  type Llama,
  type LlamaModel,
  type LlamaContext,
  type LlamaContextSequence,
} from "node-llama-cpp";

const SYSTEM_PROMPT =
  "あなたはプロの校正者です。入力された文章の文法ミスを修正し、より自然な表現を提案してください。意味は変えないでください。";

export class ProofreadingEngine {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private sequence: LlamaContextSequence | null = null;
  private session: LlamaChatSession | null = null;

  /**
   * Initialize the engine with a GGUF model at the given path.
   * Runs asynchronously and does not block the main thread.
   */
  async initialize(modelPath: string): Promise<void> {
    await this.dispose();

    const llama = await getLlama({
      gpu: "auto",
      build: "never",
      logLevel: LlamaLogLevel.warn,
    });

    const model = await llama.loadModel({
      modelPath,
      gpuLayers: "auto",
    });

    const context = await model.createContext({
      contextSize: "auto",
    });

    const sequence = context.getSequence();
    const session = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt: SYSTEM_PROMPT,
      autoDisposeSequence: false,
    });

    this.llama = llama;
    this.model = model;
    this.context = context;
    this.sequence = sequence;
    this.session = session;
  }

  /**
   * Run proofreading on the given text. Returns the corrected text.
   * Throws if the engine is not initialized or inference fails.
   */
  async proofread(text: string): Promise<string> {
    const session = this.session;
    if (!session) {
      throw new Error("Proofreading engine not initialized. Call initialize() first.");
    }

    session.resetChatHistory();
    const result = await session.prompt(text, {
      maxTokens: 4096,
      temperature: 0.3,
    });
    return result.trim();
  }

  get isInitialized(): boolean {
    return this.session != null && !this.session.disposed;
  }

  /**
   * Release model and context. Safe to call multiple times.
   */
  async dispose(): Promise<void> {
    try {
      if (this.sequence && !this.sequence.disposed) {
        this.sequence.dispose();
      }
    } catch {
      /* ignore */
    }
    this.sequence = null;
    this.session = null;
    this.context = null;
    this.model = null;

    if (this.llama && !this.llama.disposed) {
      await this.llama.dispose();
    }
    this.llama = null;
  }
}

export const proofreadingEngine = new ProofreadingEngine();
