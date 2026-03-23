"use client";

/**
 * BufferStore — centralized content management for split editors.
 *
 * Each open file/document has exactly one BufferState. Multiple dockview panels
 * can reference the same buffer (e.g. when a file is shown in two splits).
 * Content changes propagate via a subscriber pattern with sourcePanelId to
 * prevent infinite loops.
 */

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { MdiFileDescriptor } from "@/lib/project/mdi-file";
import type { SupportedFileExtension } from "@/lib/project/project-types";
import type { BufferId, BufferState, BufferChangeEvent } from "./types";
import { getRandomillusionstory } from "@/lib/project/illusion-stories";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let nextBufferCounter = 0;

export function generateBufferId(): BufferId {
  return `buf-${++nextBufferCounter}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// BufferStore class (framework-agnostic core)
// ---------------------------------------------------------------------------

export type BufferSubscriber = (event: BufferChangeEvent) => void;
type StoreListener = () => void;

export class BufferStore {
  private _buffers: Map<BufferId, BufferState> = new Map();
  private _subscribers: Map<BufferId, Set<BufferSubscriber>> = new Map();
  /** Listeners for React useSyncExternalStore (notified on any buffer change) */
  private _storeListeners: Set<StoreListener> = new Set();
  /** Monotonically increasing version for snapshot identity */
  private _version = 0;

  // -- Snapshot for useSyncExternalStore ------------------------------------

  getVersion(): number {
    return this._version;
  }

  private _notify(): void {
    this._version++;
    for (const listener of this._storeListeners) {
      listener();
    }
  }

  subscribeStore(listener: StoreListener): () => void {
    this._storeListeners.add(listener);
    return () => {
      this._storeListeners.delete(listener);
    };
  }

  // -- Buffer CRUD ----------------------------------------------------------

  getBuffers(): BufferState[] {
    return Array.from(this._buffers.values());
  }

  getBuffer(id: BufferId): BufferState | undefined {
    return this._buffers.get(id);
  }

  getBufferByPath(path: string): BufferState | undefined {
    for (const buf of this._buffers.values()) {
      if (buf.file?.path === path) return buf;
    }
    return undefined;
  }

  getBufferByHandle(handle: FileSystemFileHandle): BufferState | undefined {
    for (const buf of this._buffers.values()) {
      if (buf.file?.handle && buf.file.handle === handle) return buf;
    }
    return undefined;
  }

  createBuffer(opts?: {
    content?: string;
    fileType?: SupportedFileExtension;
    file?: MdiFileDescriptor;
    isPreview?: boolean;
    id?: BufferId;
  }): BufferState {
    const fileType = opts?.fileType ?? ".mdi";
    const content =
      opts?.content ?? (fileType === ".mdi" ? getRandomillusionstory() : "");
    const buffer: BufferState = {
      id: opts?.id ?? generateBufferId(),
      file: opts?.file ?? null,
      content,
      lastSavedContent: content,
      isDirty: false,
      lastSavedTime: null,
      lastSaveWasAuto: false,
      isSaving: false,
      isPreview: opts?.isPreview ?? false,
      fileType,
    };
    this._buffers.set(buffer.id, buffer);
    this._notify();
    return buffer;
  }

  updateBuffer(id: BufferId, updates: Partial<BufferState>): void {
    const existing = this._buffers.get(id);
    if (!existing) return;
    this._buffers.set(id, { ...existing, ...updates, id }); // id is immutable
    this._notify();
  }

  removeBuffer(id: BufferId): void {
    this._buffers.delete(id);
    this._subscribers.delete(id);
    this._notify();
  }

  /**
   * Update buffer content. Computes isDirty automatically.
   * Emits a BufferChangeEvent to subscribers with the sourcePanelId so that
   * the originating panel can ignore the echo.
   */
  setBufferContent(
    id: BufferId,
    content: string,
    sourcePanelId?: string,
  ): void {
    const existing = this._buffers.get(id);
    if (!existing) return;
    // Skip if content unchanged
    if (existing.content === content) return;

    const isDirty = content !== existing.lastSavedContent;
    this._buffers.set(id, { ...existing, content, isDirty });
    this._notify();

    // Notify per-buffer subscribers (for cross-panel sync)
    const subs = this._subscribers.get(id);
    if (subs) {
      const event: BufferChangeEvent = { bufferId: id, content, sourcePanelId };
      for (const cb of subs) {
        cb(event);
      }
    }
  }

  // -- Per-buffer subscriptions (for cross-panel content sync) --------------

  subscribe(bufferId: BufferId, cb: BufferSubscriber): () => void {
    let subs = this._subscribers.get(bufferId);
    if (!subs) {
      subs = new Set();
      this._subscribers.set(bufferId, subs);
    }
    subs.add(cb);
    return () => {
      subs!.delete(cb);
      if (subs!.size === 0) {
        this._subscribers.delete(bufferId);
      }
    };
  }

  // -- Utility --------------------------------------------------------------

  /** Check if any buffer references the given bufferId */
  hasBuffer(id: BufferId): boolean {
    return this._buffers.has(id);
  }

  /** Get count of buffers */
  get size(): number {
    return this._buffers.size;
  }

  /** Check if any buffer has unsaved changes */
  hasUnsavedChanges(): boolean {
    for (const buf of this._buffers.values()) {
      if (buf.isDirty) return true;
    }
    return false;
  }

  /** Clear all buffers */
  clear(): void {
    this._buffers.clear();
    this._subscribers.clear();
    this._notify();
  }
}

// ---------------------------------------------------------------------------
// React context + hooks
// ---------------------------------------------------------------------------

const BufferStoreContext = createContext<BufferStore | null>(null);

export function BufferStoreProvider({
  store,
  children,
}: {
  store: BufferStore;
  children: ReactNode;
}) {
  return (
    <BufferStoreContext.Provider value={store}>
      {children}
    </BufferStoreContext.Provider>
  );
}

export function useBufferStoreInstance(): BufferStore {
  const store = useContext(BufferStoreContext);
  if (!store) {
    throw new Error("useBufferStoreInstance must be used within a BufferStoreProvider");
  }
  return store;
}

/**
 * Hook that returns a reactive snapshot of all buffers.
 * Re-renders when any buffer changes.
 */
export function useBuffers(): BufferState[] {
  const store = useBufferStoreInstance();
  const subscribe = useCallback(
    (cb: () => void) => store.subscribeStore(cb),
    [store],
  );
  const getSnapshot = useCallback(() => store.getBuffers(), [store]);
  // Use version as external store subscription trigger
  const version = useSyncExternalStore(
    subscribe,
    useCallback(() => store.getVersion(), [store]),
    useCallback(() => store.getVersion(), [store]),
  );
  // Return fresh array on version change
  void version;
  return store.getBuffers();
}

/**
 * Hook that returns a single buffer by ID, reactive to changes.
 */
export function useBuffer(bufferId: BufferId | null): BufferState | undefined {
  const store = useBufferStoreInstance();
  const subscribe = useCallback(
    (cb: () => void) => store.subscribeStore(cb),
    [store],
  );
  useSyncExternalStore(
    subscribe,
    useCallback(() => store.getVersion(), [store]),
    useCallback(() => store.getVersion(), [store]),
  );
  return bufferId ? store.getBuffer(bufferId) : undefined;
}
