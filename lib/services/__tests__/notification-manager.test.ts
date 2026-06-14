/**
 * Tests for NotificationManager — focused on the subscribe replay behaviour
 * that fixes the startup-toast timing race (P2-2).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Import the class directly via the module so each test can create a fresh instance
// (the exported `notificationManager` singleton is shared and hard to reset).
// We re-export the internal class for testing by importing the module and casting.
// Since NotificationManager is not exported, we test through the exported singleton
// but reset it between tests via dismissAll().
import { notificationManager } from "@/lib/services/notification-manager";

beforeEach(() => {
  notificationManager.dismissAll();
});

describe("NotificationManager.subscribe (replay)", () => {
  it("replays pending notifications to a late subscriber", () => {
    // Post a message before any subscriber exists
    notificationManager.showMessage("早期メッセージ", { type: "info", duration: 0 });

    // Subscribe after the fact — should receive the existing notification
    const listener = vi.fn();
    const unsubscribe = notificationManager.subscribe(listener);

    expect(listener).toHaveBeenCalledOnce();
    const received = listener.mock.calls[0][0] as { message: string }[];
    expect(received).toHaveLength(1);
    expect(received[0].message).toBe("早期メッセージ");

    unsubscribe();
  });

  it("does not replay when there are no pending notifications", () => {
    const listener = vi.fn();
    const unsubscribe = notificationManager.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("new notifications after subscribe are still forwarded normally", () => {
    const listener = vi.fn();
    const unsubscribe = notificationManager.subscribe(listener);

    notificationManager.showMessage("新しいメッセージ", { type: "warning", duration: 0 });

    expect(listener).toHaveBeenCalledOnce();
    const received = listener.mock.calls[0][0] as { message: string }[];
    expect(received[0].message).toBe("新しいメッセージ");

    unsubscribe();
  });

  it("replays multiple pending notifications in order", () => {
    notificationManager.showMessage("A", { type: "info", duration: 0 });
    notificationManager.showMessage("B", { type: "warning", duration: 0 });

    const listener = vi.fn();
    const unsubscribe = notificationManager.subscribe(listener);

    const received = listener.mock.calls[0][0] as { message: string }[];
    expect(received.map((n) => n.message)).toEqual(["A", "B"]);

    unsubscribe();
  });

  it("unsubscribe stops further deliveries", () => {
    const listener = vi.fn();
    const unsubscribe = notificationManager.subscribe(listener);
    unsubscribe();
    listener.mockReset();

    notificationManager.showMessage("post-unsubscribe", { type: "info", duration: 0 });

    expect(listener).not.toHaveBeenCalled();
  });
});
