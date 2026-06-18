import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { loadAppState } = vi.hoisted(() => ({ loadAppState: vi.fn() }));
vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({ loadAppState }),
}));
vi.mock("@/lib/dict/dict-access", () => ({
  getDictAccess: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: {
    showProgress: vi.fn(() => "id"),
    updateProgress: vi.fn(),
    updateMessage: vi.fn(),
    showMessage: vi.fn(() => "id"),
    dismiss: vi.fn(),
    error: vi.fn(),
  },
}));

import { isAutoDownloadAllowed } from "@/lib/services/startup-checks/dict-auto-download";

type ConnectionLike = { type?: string; saveData?: boolean };

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
}
function setConnection(conn: ConnectionLike | undefined) {
  Object.defineProperty(navigator, "connection", { value: conn, configurable: true });
}

describe("isAutoDownloadAllowed", () => {
  beforeEach(() => {
    loadAppState.mockReset();
    loadAppState.mockResolvedValue(null);
    setOnline(true);
    setConnection(undefined);
  });
  afterEach(() => {
    setConnection(undefined);
    setOnline(true);
  });

  it("allows when online, no connection info, and power-save off", async () => {
    expect(await isAutoDownloadAllowed()).toBe(true);
  });

  it("blocks when offline", async () => {
    setOnline(false);
    expect(await isAutoDownloadAllowed()).toBe(false);
  });

  it("blocks on a cellular connection (metered radio)", async () => {
    setConnection({ type: "cellular" });
    expect(await isAutoDownloadAllowed()).toBe(false);
  });

  it("blocks when the OS data-saver is on", async () => {
    setConnection({ type: "wifi", saveData: true });
    expect(await isAutoDownloadAllowed()).toBe(false);
  });

  it("allows on wifi without data-saver", async () => {
    setConnection({ type: "wifi", saveData: false });
    expect(await isAutoDownloadAllowed()).toBe(true);
  });

  it("blocks when the app power-save (throttle) mode is on", async () => {
    loadAppState.mockResolvedValue({ powerSaveMode: true });
    expect(await isAutoDownloadAllowed()).toBe(false);
  });

  it("allows when loadAppState throws (no signal → fall back to other gates)", async () => {
    loadAppState.mockRejectedValue(new Error("storage error"));
    expect(await isAutoDownloadAllowed()).toBe(true);
  });
});
