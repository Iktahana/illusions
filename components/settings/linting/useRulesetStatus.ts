"use client";

import { useCallback, useEffect, useState } from "react";

import { isElectronRenderer } from "@/lib/utils/runtime-env";

/** Matches RulesetManifest from the SDK — only the fields the UI needs. */
export interface RulesetRuleMeta {
  ruleId: string;
  nameJa: string;
  descriptionJa?: string;
  guidelineId?: string;
  level?: string;
  defaultConfig?: { enabled?: boolean; severity?: string };
  applicableModes?: string[];
  supportsSkipDialogue?: boolean;
}

export interface RulesetGuidelineMeta {
  id?: string;
  nameJa?: string;
  publisherJa?: string;
  year?: number | null;
}

export interface RulesetManifest {
  id: string;
  name: string;
  nameJa: string;
  version?: string;
  license?: string;
  licenseUrl?: string;
  purchaseUrl?: string;
  publisherJa?: string;
  guidelines?: RulesetGuidelineMeta[];
  rules: RulesetRuleMeta[];
}

export interface InstalledRuleset {
  id: string;
  nameJa: string;
  version: string | null;
  tag: string | null;
  publisherJa: string | null;
  license: string | null;
  licenseUrl: string | null;
  purchaseUrl: string | null;
  rules: RulesetRuleMeta[];
  updateAvailable: boolean;
  /** Sync in-progress for this pack */
  syncing: boolean;
  /** Error loading or syncing this pack */
  error: string | null;
}

export interface UseRulesetStatusReturn {
  rulesets: InstalledRuleset[];
  loading: boolean;
  refresh: () => Promise<void>;
  sync: () => Promise<void>;
  uninstall: (id: string) => Promise<void>;
}

function getRulesetsAPI(): NonNullable<Window["electronAPI"]>["rulesets"] {
  return (window as Window & { electronAPI?: Window["electronAPI"] }).electronAPI?.rulesets;
}

export function useRulesetStatus(): UseRulesetStatusReturn {
  const isElectron = isElectronRenderer();
  const [rulesets, setRulesets] = useState<InstalledRuleset[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!isElectron) return;
    const api = getRulesetsAPI();
    if (!api) return;

    setLoading(true);
    try {
      // 1. List installed
      const installed = await api.listInstalled();

      // 2. Read manifests in parallel
      const moduleResults = await Promise.all(installed.map((r) => api.readModule(r.id)));

      // 3. Check updates (best-effort)
      const updateMap: Map<string, boolean> = new Map();
      try {
        const updateResults = await api.checkUpdate();
        for (const u of updateResults) {
          updateMap.set(u.id, u.updateAvailable ?? false);
        }
      } catch {
        // update check failing is non-fatal
      }

      const next: InstalledRuleset[] = installed.map((r, i) => {
        const mod = moduleResults[i];
        if (!mod || !mod.ok) {
          return {
            id: r.id,
            nameJa: r.id,
            version: r.version,
            tag: r.tag,
            publisherJa: null,
            license: null,
            licenseUrl: null,
            purchaseUrl: null,
            rules: [],
            updateAvailable: updateMap.get(r.id) ?? false,
            syncing: false,
            error:
              mod && !mod.ok
                ? (mod as { ok: false; id: string; reason: string }).reason
                : "読み込みに失敗しました",
          };
        }
        const manifest = mod.manifest as RulesetManifest;
        return {
          id: r.id,
          nameJa: manifest.nameJa ?? manifest.name ?? r.id,
          version: r.version ?? manifest.version ?? null,
          tag: r.tag,
          publisherJa: manifest.publisherJa ?? manifest.guidelines?.[0]?.publisherJa ?? null,
          license: manifest.license ?? null,
          licenseUrl: manifest.licenseUrl ?? null,
          purchaseUrl: manifest.purchaseUrl ?? null,
          rules: manifest.rules ?? [],
          updateAvailable: updateMap.get(r.id) ?? false,
          syncing: false,
          error: null,
        };
      });

      setRulesets(next);
    } catch (err) {
      console.error("[useRulesetStatus] refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, [isElectron]);

  const sync = useCallback(async (): Promise<void> => {
    if (!isElectron) return;
    const api = getRulesetsAPI();
    if (!api) return;
    await api.sync();
    await refresh();
  }, [isElectron, refresh]);

  const uninstall = useCallback(
    async (id: string): Promise<void> => {
      if (!isElectron) return;
      const api = getRulesetsAPI();
      if (!api) return;
      await api.uninstall(id);
      await refresh();
    },
    [isElectron, refresh],
  );

  // Initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Subscribe to progress events and change notifications
  useEffect(() => {
    if (!isElectron) return;
    const api = getRulesetsAPI();
    if (!api) return;

    const unsubProgress = api.onSyncProgress((data) => {
      setRulesets((prev) =>
        prev.map((r) =>
          r.id === data.id
            ? {
                ...r,
                syncing: data.status === "installed",
                error: data.status === "error" ? (data.detail ?? "同期エラー") : r.error,
              }
            : r,
        ),
      );
    });

    const unsubChanged = api.onChanged(() => {
      void refresh();
    });

    return () => {
      unsubProgress();
      unsubChanged();
    };
  }, [isElectron, refresh]);

  return { rulesets, loading, refresh, sync, uninstall };
}
