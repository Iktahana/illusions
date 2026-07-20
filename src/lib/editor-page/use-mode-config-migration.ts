"use client";

/**
 * One-time recovery of `lintingRuleConfigs` for installs whose persisted config
 * predates mode-aware rule derivation.
 *
 * Background: the #1809/#1810 regression zeroed the built-in rule tables, and the
 * "すべて有効" bulk toggle / broken mode switch left existing users with a
 * COMPLETE all-enabled config map under the new external rule IDs. Neither the
 * empty-config seed (#1818) nor a fill-missing pass can correct that — no key is
 * missing, so on launch every rule stays enabled in every mode until the user
 * re-picks a mode by hand.
 *
 * This migration re-derives the config from the *current* mode exactly once,
 * gated by a persisted version, so the selected mode actually filters rules on
 * the next launch without any manual action. It also covers fresh installs
 * (empty config → seeded from mode).
 *
 * Deliberately a full replace (not merge): for these installs the stored map is
 * a regression artifact, not curated per-rule state. After the version is
 * bumped it never runs again, so later manual per-rule edits persist normally.
 */

import { useEffect } from "react";

import type { CorrectionModeId } from "@/lib/linting/correction-config";
import {
  buildModeRuleConfigsFromRules,
  type ModeRuleMetaInput,
} from "@/lib/linting/mode-rule-configs";
import type { Severity } from "@/lib/linting/types";

/**
 * Bump when the mode→config derivation changes in a way that warrants
 * re-applying to existing installs.
 * - v1: initial regression recovery (#1818 follow-up).
 */
export const MODE_CONFIG_MIGRATION_VERSION = 1;

/**
 * Pure guard so the run decision can be unit-tested without React. Migrate only
 * once settings are hydrated (so the real persisted mode/version are known),
 * rules are loaded (so the derived map is non-empty), and the stored version is
 * behind the current one.
 */
export function shouldRunModeConfigMigration(
  hydrated: boolean,
  loadedRulesCount: number,
  configVersion: number | undefined,
): boolean {
  return hydrated && loadedRulesCount > 0 && (configVersion ?? 0) < MODE_CONFIG_MIGRATION_VERSION;
}

export interface ModeConfigMigrationParams {
  /** True once persisted app state has been loaded into the settings hooks. */
  hydrated: boolean;
  /** Rule metas of every installed ruleset (empty on Web / before load). */
  loadedRules: readonly ModeRuleMetaInput[];
  /** The current correction mode (already hydrated). */
  currentMode: CorrectionModeId;
  /** Persisted migration version (undefined / 0 = never migrated). */
  configVersion: number | undefined;
  /** Replace the whole rule-config map (handleLintingRuleConfigsBatchChange). */
  applyConfigs: (
    configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>,
  ) => void;
  /** Persist the new migration version. */
  setConfigVersion: (version: number) => void;
}

/**
 * Runs {@link shouldRunModeConfigMigration} as an effect; when it fires, derives
 * the per-rule config for the current mode and bumps the stored version.
 */
export function useModeConfigMigration(params: ModeConfigMigrationParams): void {
  const { hydrated, loadedRules, currentMode, configVersion, applyConfigs, setConfigVersion } =
    params;

  useEffect(() => {
    if (!shouldRunModeConfigMigration(hydrated, loadedRules.length, configVersion)) return;
    applyConfigs(buildModeRuleConfigsFromRules(currentMode, loadedRules));
    setConfigVersion(MODE_CONFIG_MIGRATION_VERSION);
  }, [hydrated, loadedRules, currentMode, configVersion, applyConfigs, setConfigVersion]);
}
