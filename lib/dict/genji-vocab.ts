/**
 * GenjiVocab — renderer-side headword lookup.
 *
 * Pulls the set of noun headwords from the main-process Genji dictionary
 * once and exposes synchronous `has()` for the lint rule. Only available
 * in Electron; returns unavailable in web mode.
 */

import { isElectronRenderer } from "@/lib/utils/runtime-env";

export type GenjiVocabState = "idle" | "loading" | "ready" | "unavailable";

class GenjiVocab {
  private headwords: Set<string> = new Set();
  private state: GenjiVocabState = "idle";
  private loadPromise: Promise<void> | null = null;
  private listeners: Set<() => void> = new Set();

  /**
   * Load the headword list if it hasn't been loaded yet.
   * Safe to call repeatedly; concurrent calls share the same promise.
   * Returns a no-op in non-Electron environments.
   */
  async initialize(): Promise<void> {
    if (this.state === "ready" || this.state === "unavailable") return;
    if (this.state === "loading" && this.loadPromise) return this.loadPromise;

    if (!isElectronRenderer() || !window.electronAPI?.dict?.listNounHeadwords) {
      this.state = "unavailable";
      this.notify();
      return;
    }

    this.state = "loading";
    this.loadPromise = (async () => {
      try {
        const words = await window.electronAPI!.dict!.listNounHeadwords!();
        this.headwords = new Set(words);
        this.state = this.headwords.size > 0 ? "ready" : "unavailable";
      } catch (err) {
        console.error("[GenjiVocab] Failed to load headwords:", err);
        this.state = "unavailable";
      } finally {
        this.notify();
      }
    })();

    return this.loadPromise;
  }

  has(surface: string): boolean {
    return this.state === "ready" && this.headwords.has(surface);
  }

  isReady(): boolean {
    return this.state === "ready";
  }

  getState(): GenjiVocabState {
    return this.state;
  }

  /** Reload the headword list (e.g. after a dictionary install). */
  async reload(): Promise<void> {
    this.state = "idle";
    this.loadPromise = null;
    this.headwords = new Set();
    return this.initialize();
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch (err) {
        console.error("[GenjiVocab] listener error:", err);
      }
    }
  }
}

export const genjiVocab = new GenjiVocab();
