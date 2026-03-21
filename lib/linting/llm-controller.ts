import type { ILlmClient } from "@/lib/llm-client/types";

/**
 * LLM lifecycle states for cloud inference.
 *
 * Cloud models are always available — no LOADING/UNLOADING needed.
 * COOLING is kept to support future rate-limit backoff logic.
 */
export type LlmState = "IDLE" | "ACTIVE" | "COOLING";

/** Options accepted by LlmController constructor */
export interface LlmControllerOptions {
  /** Milliseconds to wait after last task finishes before returning to IDLE. Default: 60_000 */
  cooldownMs?: number;
}

/**
 * Manages LLM task lifecycle for cloud inference.
 *
 * State machine:
 *   IDLE → ACTIVE (on task start) → COOLING (on task end) → IDLE (after cooldown)
 *
 * Cloud models are always ready — no model load/unload management needed.
 */
export class LlmController {
  private readonly _client: ILlmClient;
  private readonly _cooldownMs: number;

  private _state: LlmState = "IDLE";
  private _cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private _listeners: Set<(state: LlmState) => void> = new Set();

  constructor(
    client: ILlmClient,
    _modelId: string,  // kept for API compat; unused for cloud
    options: LlmControllerOptions = {},
  ) {
    this._client = client;
    this._cooldownMs = options.cooldownMs ?? 60_000;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Returns the current lifecycle state. */
  getState(): LlmState {
    return this._state;
  }

  /**
   * Subscribe to state changes.
   * @returns Unsubscribe function — call it to stop receiving events.
   */
  onStateChange(cb: (state: LlmState) => void): () => void {
    this._listeners.add(cb);
    return () => {
      this._listeners.delete(cb);
    };
  }

  /**
   * Request a validation task.
   *
   * The state transitions to ACTIVE while the task runs.
   * After the task completes, a cooldown timer starts before returning to IDLE.
   * Cloud models are always ready — no load/unload needed.
   */
  async requestValidation(task: () => Promise<void>): Promise<void> {
    this._cancelCooldown();

    this._setState("ACTIVE");
    try {
      await task();
    } finally {
      this._startCooldown();
    }
  }

  /**
   * No-op for cloud clients (no local model to unload).
   * Kept for API compatibility.
   */
  async unload(): Promise<void> {
    this._cancelCooldown();
    this._setState("IDLE");
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private _startCooldown(): void {
    this._setState("COOLING");
    this._cooldownTimer = setTimeout(() => {
      this._cooldownTimer = null;
      if (this._state === "COOLING") {
        this._setState("IDLE");
      }
    }, this._cooldownMs);
  }

  private _cancelCooldown(): void {
    if (this._cooldownTimer !== null) {
      clearTimeout(this._cooldownTimer);
      this._cooldownTimer = null;
    }
  }

  private _setState(state: LlmState): void {
    this._state = state;
    this._listeners.forEach((cb) => cb(state));
  }

  /** @internal Expose client for testing */
  get _testClient(): ILlmClient {
    return this._client;
  }
}
