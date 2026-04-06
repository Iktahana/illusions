"use client";

/**
 * Dockview split editor module — barrel exports.
 */

// Types
export type {
  BufferId,
  BufferState,
  EditorPanelParams,
  DockviewLayoutState,
  SimplifiedGroupLayout,
  SerializedBuffer,
  BufferChangeEvent,
} from "./types";

// BufferStore
export {
  BufferStore,
  BufferStoreProvider,
  useBufferStoreInstance,
  useBuffers,
  useBuffer,
  generateBufferId,
} from "./buffer-store";

// Dockview components
export {
  EditorPanel,
  DockviewTabHeader,
  dockviewComponents,
  dockviewTabComponents,
} from "./dockview-components";

// Adapter hook
export {
  useDockviewAdapter,
  type UseDockviewAdapterOptions,
  type UseDockviewAdapterReturn,
} from "./use-dockview-adapter";

// Stable key utility
export { stableKeyForTab } from "./stable-key";

// Persistence
export { useDockviewPersistence, loadDockviewLayout } from "./use-dockview-persistence";
