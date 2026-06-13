import { describe, it, expect, vi, beforeEach } from "vitest";
import { StartupCheckQueue } from "@/lib/services/startup-check-queue";

const { showMessage } = vi.hoisted(() => ({ showMessage: vi.fn() }));
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { showMessage },
}));

describe("StartupCheckQueue", () => {
  beforeEach(() => showMessage.mockReset());

  it("surfaces a toast when a check returns a notice", async () => {
    const q = new StartupCheckQueue();
    q.register({
      id: "a",
      evaluate: async () => ({ id: "n", type: "warning", message: "hi", duration: 0 }),
    });
    await q.run();
    expect(showMessage).toHaveBeenCalledWith(
      "hi",
      expect.objectContaining({ type: "warning", duration: 0 }),
    );
  });

  it("stays silent when a check returns null", async () => {
    const q = new StartupCheckQueue();
    q.register({ id: "a", evaluate: async () => null });
    await q.run();
    expect(showMessage).not.toHaveBeenCalled();
  });

  it("evaluates checks in registration order", async () => {
    const order: string[] = [];
    const q = new StartupCheckQueue();
    q.register({ id: "a", evaluate: async () => { order.push("a"); return null; } });
    q.register({ id: "b", evaluate: async () => { order.push("b"); return null; } });
    await q.run();
    expect(order).toEqual(["a", "b"]);
  });

  it("re-registering the same id replaces the previous check", async () => {
    const q = new StartupCheckQueue();
    const first = vi.fn(async () => null);
    const second = vi.fn(async () => null);
    q.register({ id: "a", evaluate: first });
    q.register({ id: "a", evaluate: second });
    await q.run();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it("isolates a throwing check and keeps running the rest", async () => {
    const q = new StartupCheckQueue();
    const after = vi.fn(async () => null);
    q.register({ id: "boom", evaluate: async () => { throw new Error("x"); } });
    q.register({ id: "ok", evaluate: after });
    await expect(q.run()).resolves.toBeUndefined();
    expect(after).toHaveBeenCalled();
  });
});
