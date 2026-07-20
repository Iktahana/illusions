import { beforeEach, describe, expect, it, vi } from "vitest";

const { storage } = vi.hoisted(() => ({
  storage: {
    initialize: vi.fn(),
    loadAppState: vi.fn(),
    saveAppState: vi.fn(),
    updateAppState: vi.fn(),
    onAppStateUpdated: vi.fn(),
  },
}));

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => storage,
}));

import { persistAppState, subscribeToAppStateUpdates } from "@/lib/storage/app-state-manager";

describe("AppState cross-window storage hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.initialize.mockResolvedValue(undefined);
    storage.updateAppState.mockResolvedValue({ compactMode: true });
  });

  it("uses the platform atomic update rather than renderer read/merge/write", async () => {
    await expect(persistAppState({ compactMode: true })).resolves.toEqual({ compactMode: true });

    expect(storage.updateAppState).toHaveBeenCalledWith({ compactMode: true });
    expect(storage.loadAppState).not.toHaveBeenCalled();
    expect(storage.saveAppState).not.toHaveBeenCalled();
  });

  it("exposes canonical snapshot subscription without introducing a persistence loop", () => {
    const unsubscribe = vi.fn();
    storage.onAppStateUpdated.mockReturnValue(unsubscribe);
    const callback = vi.fn();

    expect(subscribeToAppStateUpdates(callback)).toBe(unsubscribe);
    expect(storage.onAppStateUpdated).toHaveBeenCalledWith(callback);
  });
});
