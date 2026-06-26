"use client";

/**
 * Builds a `ruleId → owning ruleset` map for the inspector's correction panel.
 *
 * 内蔵ルールをゼロ化したあと、すべての校正ルールは外部ルールセット（出典）
 * から供給される。検出結果を「出典別」にまとめるには、各 ruleId がどの
 * ルールセットに属するかを知る必要がある。このフックは installed manifests を
 * 読み、`ruleId → { id, nameJa }` の対応表を返す。
 *
 * `use-installed-rule-metas.ts` と同様にディスク上の manifest だけを読む
 * （checkUpdate なし＝ネットワーク無し）。Web 版には外部ルールセットが
 * 無いため空の Map を返す。
 */

import { useEffect, useState } from "react";

import { isElectronRenderer } from "@/lib/utils/runtime-env";

/** The owning ruleset of a rule, as surfaced to the corrections panel. */
export interface RuleSource {
  /** Ruleset id (e.g. "genji-vocab"). */
  id: string;
  /** Japanese display name of the ruleset. */
  nameJa: string;
}

interface ManifestRule {
  ruleId: string;
}

interface ManifestShape {
  id?: string;
  name?: string;
  nameJa?: string;
  rules?: ManifestRule[];
}

function getRulesetsAPI(): NonNullable<Window["electronAPI"]>["rulesets"] | undefined {
  return (window as Window & { electronAPI?: Window["electronAPI"] }).electronAPI?.rulesets;
}

/**
 * Read installed ruleset manifests and build a `ruleId → RuleSource` map.
 * Pure (no React) so it can be unit-tested and reused. Returns an empty Map on
 * Web or when the rulesets API is unavailable.
 */
export async function loadRuleSourceMap(): Promise<Map<string, RuleSource>> {
  const map = new Map<string, RuleSource>();
  if (!isElectronRenderer()) return map;
  const api = getRulesetsAPI();
  if (!api) return map;
  try {
    const installed = await api.listInstalled();
    const mods = await Promise.all(installed.map((r) => api.readModule(r.id)));
    installed.forEach((info, i) => {
      const mod = mods[i];
      if (!mod || !mod.ok) return;
      const manifest = mod.manifest as ManifestShape;
      const source: RuleSource = {
        id: manifest.id ?? info.id,
        nameJa: manifest.nameJa ?? manifest.name ?? info.id,
      };
      for (const rule of manifest.rules ?? []) {
        if (!rule || typeof rule.ruleId !== "string") continue;
        // 先勝ち（buildRules と同じく重複 ruleId は最初の定義を採用）。
        if (!map.has(rule.ruleId)) map.set(rule.ruleId, source);
      }
    });
  } catch (err) {
    console.error("[useRuleSourceMap] failed to load rule source map", err);
  }
  return map;
}

/**
 * Returns a `ruleId → RuleSource` map for every installed external ruleset,
 * refreshing when packs are installed/updated/uninstalled.
 */
export function useRuleSourceMap(): Map<string, RuleSource> {
  const isElectron = isElectronRenderer();
  const [map, setMap] = useState<Map<string, RuleSource>>(() => new Map());

  // Initial load on mount.
  useEffect(() => {
    let cancelled = false;
    loadRuleSourceMap().then((next) => {
      if (!cancelled) setMap(next);
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
      loadRuleSourceMap().then(setMap);
    });
    return unsubscribe;
  }, [isElectron]);

  return map;
}
