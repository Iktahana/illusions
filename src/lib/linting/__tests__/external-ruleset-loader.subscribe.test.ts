/**
 * subscribeRulesetChanges の teardown 耐性テスト。
 *
 * ルールセット更新（changed イベント）の適用中に proxy が dispose されると
 * loadRuleset / unloadRuleset が WorkerDisposedError / WorkerStaleError を投げる。
 * これは teardown / HMR / remount の正常系なので、エラー報告（console.error /
 * notificationManager.warning）せず静かに無視しなければならない（#WorkerDisposedError）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { warning } = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { warning },
}));

import { subscribeRulesetChanges } from "@/lib/linting/external-ruleset-loader";
import type { RuleRunnerProxy } from "@/packages/milkdown-plugin-japanese-novel/linting-plugin";

type ChangedCb = (data: { reason: "installed" | "updated" | "uninstalled"; ids: string[] }) => void;

let changedCb: ChangedCb | null = null;

function installApi(readModuleImpl: (id: string) => Promise<unknown>): void {
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    rulesets: {
      onChanged: (cb: ChangedCb) => {
        changedCb = cb;
        return () => {
          changedCb = null;
        };
      },
      readModule: readModuleImpl,
    },
  };
}

function namedError(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

/** microtask キューを数回流して then/catch を確定させる。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("subscribeRulesetChanges — worker teardown tolerance", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warning.mockClear();
    changedCb = null;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it("swallows WorkerDisposedError thrown by loadRuleset during a change (no error report)", async () => {
    installApi(async (id) => ({ ok: true, id, tag: "v1", manifest: {}, code: "/* code */" }));
    const proxy = {
      loadRuleset: vi.fn(() => Promise.reject(namedError("WorkerDisposedError"))),
      unloadRuleset: vi.fn(() => Promise.resolve({ ok: true })),
    } as unknown as RuleRunnerProxy;

    subscribeRulesetChanges(proxy);
    changedCb?.({ reason: "installed", ids: ["com.test.x"] });
    await flush();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it("swallows WorkerStaleError on the uninstall path", async () => {
    installApi(async (id) => ({ ok: true, id, tag: "v1", manifest: {}, code: "" }));
    const proxy = {
      loadRuleset: vi.fn(() => Promise.resolve({ ok: true })),
      unloadRuleset: vi.fn(() => Promise.reject(namedError("WorkerStaleError"))),
    } as unknown as RuleRunnerProxy;

    subscribeRulesetChanges(proxy);
    changedCb?.({ reason: "uninstalled", ids: ["com.test.x"] });
    await flush();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("still reports a genuine (non-teardown) load failure", async () => {
    installApi(async (id) => ({ ok: true, id, tag: "v1", manifest: {}, code: "" }));
    const proxy = {
      loadRuleset: vi.fn(() => Promise.reject(new Error("boom"))),
      unloadRuleset: vi.fn(() => Promise.resolve({ ok: true })),
    } as unknown as RuleRunnerProxy;

    subscribeRulesetChanges(proxy);
    changedCb?.({ reason: "installed", ids: ["com.test.x"] });
    await flush();

    expect(errorSpy).toHaveBeenCalled();
  });
});
