/**
 * External ruleset loader — renderer-side coordinator.
 *
 * Reads installed rulesets from the Electron IPC bridge and loads them into
 * the lint Web Worker proxy. Runs as a no-op on Web (no `window.electronAPI`).
 *
 * Usage:
 *   const cleanup = await syncLoadedRulesets(proxy);
 *   const unsubscribe = subscribeRulesetChanges(proxy);
 *   // ...on teardown:
 *   unsubscribe();
 */

import type { RuleRunnerProxy } from "@/packages/milkdown-plugin-japanese-novel/linting-plugin";
import { notificationManager } from "@/lib/services/notification-manager";

// -------------------------------------------------------------------------
// Types (mirrors the IPC bridge in types/electron.d.ts)
// -------------------------------------------------------------------------

interface InstalledRulesetInfo {
  id: string;
  version: string;
  tag: string;
}

type ReadModuleResult =
  | { ok: true; id: string; tag: string; manifest: unknown; code: string }
  | { ok: false; id: string; reason: string };

interface ElectronRulesetsApi {
  listInstalled(): Promise<InstalledRulesetInfo[]>;
  readModule(id: string): Promise<ReadModuleResult>;
  uninstall(id: string): Promise<void>;
  onSyncProgress(cb: (data: unknown) => void): () => void;
  onChanged(
    cb: (data: { reason: "installed" | "updated" | "uninstalled"; ids: string[] }) => void,
  ): () => void;
}

function getRulesetsApi(): ElectronRulesetsApi | null {
  if (typeof window === "undefined") return null;
  return (
    (window as Window & { electronAPI?: { rulesets?: ElectronRulesetsApi } }).electronAPI
      ?.rulesets ?? null
  );
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Perform the initial sync: read all installed rulesets and load them into
 * the proxy. Returns a cleanup no-op (reserved for future use).
 *
 * This is a no-op on Web (returns immediately).
 * Never throws — any load failure is surfaced as a notification (Japanese).
 */
export async function syncLoadedRulesets(proxy: RuleRunnerProxy): Promise<void> {
  const api = getRulesetsApi();
  if (!api) return; // Web / no Electron bridge

  let installed: InstalledRulesetInfo[];
  try {
    installed = await api.listInstalled();
  } catch (err) {
    console.error("[external-ruleset-loader] listInstalled() failed:", err);
    return;
  }

  const failedIds: string[] = [];

  for (const info of installed) {
    try {
      const result = await api.readModule(info.id);
      if (!result.ok) {
        console.warn(`[external-ruleset-loader] readModule(${info.id}) failed: ${result.reason}`);
        failedIds.push(info.id);
        continue;
      }
      const loadResult = await proxy.loadRuleset(result.id, result.code);
      if (!loadResult.ok) {
        console.warn(
          `[external-ruleset-loader] loadRuleset(${info.id}) failed:`,
          loadResult.warnings,
        );
        failedIds.push(info.id);
      }
    } catch (err) {
      // 破棄済み worker への load は teardown / HMR の正常系。失敗扱いせず静かに中断。
      if (err instanceof Error && err.name === "WorkerDisposedError") {
        return;
      }
      console.error(`[external-ruleset-loader] failed to load ruleset "${info.id}":`, err);
      failedIds.push(info.id);
    }
  }

  if (failedIds.length > 0) {
    notificationManager.warning(
      `外部ルールセットの読み込みに失敗しました: ${failedIds.join(", ")}`,
      8000,
    );
  }
}

/**
 * Subscribe to ruleset change events from the Electron main process.
 * Handles install/update/uninstall by loading or unloading from the proxy.
 *
 * Returns an unsubscribe function. Call it on component unmount.
 * This is a no-op on Web.
 *
 * Never throws.
 */
export function subscribeRulesetChanges(proxy: RuleRunnerProxy): () => void {
  const api = getRulesetsApi();
  if (!api) return () => {};

  const unsubscribe = api.onChanged(({ reason, ids }) => {
    for (const id of ids) {
      if (reason === "uninstalled") {
        proxy.unloadRuleset(id).catch((err) => {
          console.error(`[external-ruleset-loader] unloadRuleset(${id}) failed:`, err);
        });
      } else {
        // "installed" or "updated"
        api
          .readModule(id)
          .then((result) => {
            if (!result.ok) {
              console.warn(
                `[external-ruleset-loader] readModule(${id}) after change failed: ${result.reason}`,
              );
              notificationManager.warning(
                `ルールセット「${id}」の再読み込みに失敗しました。`,
                6000,
              );
              return;
            }
            return proxy.loadRuleset(result.id, result.code).then((loadResult) => {
              if (!loadResult.ok) {
                console.warn(
                  `[external-ruleset-loader] loadRuleset(${id}) after change failed:`,
                  loadResult.warnings,
                );
                notificationManager.warning(`ルールセット「${id}」の適用に失敗しました。`, 6000);
              }
            });
          })
          .catch((err) => {
            console.error(`[external-ruleset-loader] change handler for "${id}" threw:`, err);
          });
      }
    }
  });

  return unsubscribe;
}
