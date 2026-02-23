import type { ILlmClient } from "@/lib/llm-client/types";

/**
 * LLM lifecycle states.
 *
 * State machine:
 *   IDLE → LOADING → READY → ACTIVE → COOLING → UNLOADING → IDLE
 */
export type LlmState =
  | "IDLE"
  | "LOADING"
  | "READY"
  | "ACTIVE"
  | "COOLING"
  | "UNLOADING";

/** Options accepted by LlmController constructor */
export interface LlmControllerOptions {
  /** Milliseconds to wait after last task finishes before unloading. Default: 60_000 */
  cooldownMs?: number;
}

/**
 * Minimal async mutex to prevent concurrent loadModel() calls.
 * async-mutex is not bundled with this project, so we use a simple
 * Promise-chain implementation instead.
 */
class SimpleMutex {
  private _queue: Promise<void> = Promise.resolve();

  /**
   * Acquire the mutex.
   * Returns a release function that must be called when the critical section ends.
   */
  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Chain onto the existing queue so callers are serialized
    const previous = this._queue;
    this._queue = previous.then(() => next);

    // Wait for all previous holders to release
    await previous;

    return release;
  }
}

/**
 * Manages the LLM model lifecycle with auto start/stop for power efficiency.
 *
 * State machine:
 *   IDLE → LOADING → READY → ACTIVE → COOLING → UNLOADING → IDLE
 *
 * Power efficiency is achieved by automatically unloading the model after a
 * configurable cooldown period (default 60 s) once all tasks complete.
 * This replaces the old battery-detection approach in use-power-saving.ts.
 */
export class LlmController {
  private readonly _client: ILlmClient;
  private readonly _modelId: string;
  private readonly _cooldownMs: number;
  private readonly _mutex: SimpleMutex = new SimpleMutex();

  private _state: LlmState = "IDLE";
  private _cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private _listeners: Set<(state: LlmState) => void> = new Set();

  constructor(
    client: ILlmClient,
    modelId: string,
    options: LlmControllerOptions = {},
  ) {
    this._client = client;
    this._modelId = modelId;
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
   * - If the model is not loaded, it is loaded first (LOADING → READY).
   * - The state transitions to ACTIVE while the task runs.
   * - After the task completes, a cooldown timer starts.
   * - When the timer fires (and no other task has started), the model is
   *   unloaded (UNLOADING → IDLE).
   *
   * Concurrent calls are serialized via a mutex so that the model is only
   * loaded once even when multiple requests arrive simultaneously.
   */
  async requestValidation(task: () => Promise<void>): Promise<void> {
    // Cancel any pending cooldown — we're active again
    this._cancelCooldown();

    // Serialize model loading to prevent race conditions (fixes #424)
    const release = await this._mutex.acquire();
    try {
      if (this._state === "IDLE" || this._state === "UNLOADING") {
        await this._load();
      }
    } finally {
      release();
    }

    // Run the task in ACTIVE state
    this._setState("ACTIVE");
    try {
      await task();
    } finally {
      // Start cooldown regardless of whether the task succeeded or failed
      this._startCooldown();
    }
  }

  /**
   * Immediately unload the model from memory.
   * Safe to call from any state; no-op when already IDLE.
   */
  async unload(): Promise<void> {
    this._cancelCooldown();

    if (this._state === "IDLE") return;

    await this._unload();
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async _load(): Promise<void> {
    this._setState("LOADING");
    await this._client.loadModel(this._modelId);
    this._setState("READY");
  }

  private async _unload(): Promise<void> {
    this._setState("UNLOADING");
    await this._client.unloadModel();
    this._setState("IDLE");
  }

  private _startCooldown(): void {
    this._setState("COOLING");
    this._cooldownTimer = setTimeout(() => {
      this._cooldownTimer = null;
      // Only unload if we're still cooling (not interrupted by a new task)
      if (this._state === "COOLING") {
        void this._unload();
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
}
