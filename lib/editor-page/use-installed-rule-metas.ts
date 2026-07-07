"use client";

/**
 * Loads the per-rule metadata (`ruleId` + `applicableModes` + `defaultConfig`)
 * of every installed external ruleset for the editor page, so the inspector's
 * correction-mode dropdown can derive the full per-rule config map on switch
 * (see {@link buildModeRuleConfigsFromRules}).
 *
 * #1817 fixed the settings `ModeSelector` (which sources rules from
 * `useRulesetStatus`), but the inspector dropdown lives in `app/page.tsx` and
 * had no rule list, so switching modes there still wiped every rule to {}.
 * This hook supplies that list. It deliberately does NOT call `checkUpdate`
 * (no network) — it only reads the installed manifests already on disk.
 *
 * Electron only: the rulesets API is exposed by the desktop preload bridge.
 * On Web there are no external rulesets, so this returns an empty array.
 */

import { useEffect, useState } from "react";

import type { ModeRuleMetaInput } from "@/lib/linting/mode-rule-configs";
import { isElectronRenderer } from "@/lib/utils/runtime-env";

interface ManifestRule {
  ruleId: string;
  applicableModes?: string[];
  defaultConfig?: {
    enabled?: boolean;
    severity?: string;
    skipDialogue?: boolean;
    options?: Record<string, unknown>;
  };
  suggestsDictionaryEntry?: boolean;
}

function getRulesetsAPI(): NonNullable<Window["electronAPI"]>["rulesets"] | undefined {
  return (window as Window & { electronAPI?: Window["electronAPI"] }).electronAPI?.rulesets;
}

/**
 * Read and flatten the rule metas of every installed external ruleset.
 * Pure (no React) so it can be unit-tested and reused. Returns [] on Web or
 * when the rulesets API is unavailable.
 */
export async function loadInstalledRuleMetas(): Promise<ModeRuleMetaInput[]> {
  if (!isElectronRenderer()) return [];
  const api = getRulesetsAPI();
  if (!api) return [];
  try {
    const installed = await api.listInstalled();
    const mods = await Promise.all(installed.map((r) => api.readModule(r.id)));
    const out: ModeRuleMetaInput[] = [];
    for (const mod of mods) {
      if (!mod || !mod.ok) continue;
      const manifest = mod.manifest as { rules?: ManifestRule[] };
      for (const rule of manifest.rules ?? []) {
        if (!rule || typeof rule.ruleId !== "string") continue;
        out.push({
          ruleId: rule.ruleId,
          applicableModes: rule.applicableModes,
          defaultConfig: rule.defaultConfig,
          suggestsDictionaryEntry: rule.suggestsDictionaryEntry,
        });
      }
    }
    return out;
  } catch (err) {
    console.error("[useInstalledRuleMetas] failed to load rule metas", err);
    return [];
  }
}

/**
 * Returns the flattened rule metas of every installed external ruleset,
 * refreshing when packs are installed/updated/uninstalled.
 */
export function useInstalledRuleMetas(): ModeRuleMetaInput[] {
  const isElectron = isElectronRenderer();
  const [metas, setMetas] = useState<ModeRuleMetaInput[]>([]);

  // Initial load on mount.
  useEffect(() => {
    let cancelled = false;
    loadInstalledRuleMetas().then((next) => {
      if (!cancelled) setMetas(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload when the installed ruleset set changes.
  useEffect(() => {
    if (!isElectron) return;
    const api = getRulesetsAPI();
    if (!api) return;
    const unsubscribe = api.onChanged(() => {
      loadInstalledRuleMetas().then(setMetas);
    });
    return unsubscribe;
  }, [isElectron]);

  return metas;
}
