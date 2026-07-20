import type { EditorView } from "@milkdown/prose/view";
import { useCallback, useEffect, useState } from "react";

import type { LintIssue, Severity } from "@/lib/linting/types";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";
import { RULE_GUIDELINE_MAP } from "@/lib/linting/lint-presets";
import type { CorrectionModeId, GuidelineId } from "@/lib/linting/correction-config";
import { notificationManager } from "@/lib/services/notification-manager";
import {
  RuleRunnerProxy,
  type RuleRunnerLike,
} from "@/packages/milkdown-plugin-japanese-novel/linting-plugin";
import { syncLoadedRulesets, subscribeRulesetChanges } from "@/lib/linting/external-ruleset-loader";
import { isEditorViewAlive } from "@/lib/editor-page/use-search-highlight";

export interface UseLintingResult {
  /** May be `null` until the worker has been spun up after mount. */
  ruleRunner: RuleRunnerLike | null;
  lintIssues: LintIssue[];
  isLinting: boolean;
  handleLintIssuesUpdated: (issues: LintIssue[]) => void;
  /** Callback for the decoration plugin to invoke when NLP tokenization fails.
   *  Shows a user-visible notification (in Japanese) and logs the error. */
  handleNlpError: (error: Error) => void;
  refreshLinting: () => void;
}

/**
 * Manages the RuleRunner lifecycle, registers all lint rules,
 * syncs rule configs, and provides refresh functionality.
 */
export function useLinting(
  lintingEnabled: boolean,
  lintingRuleConfigs: Record<
    string,
    {
      enabled: boolean;
      severity: Severity;
      skipDialogue?: boolean;
      options?: Record<string, unknown>;
    }
  >,
  editorViewInstance: EditorView | null,
  // Reserved for future throttling / mode-aware logic; kept in the
  // signature so callers don't have to be reworked when wired up.
  _powerSaveMode: boolean = false,
  // Guideline-based rule filtering is retired; rule application is governed
  // entirely by per-rule enabled config + correction-mode presets. Kept in the
  // signature for call-site compatibility.
  _correctionGuidelines?: GuidelineId[],
  _correctionMode?: CorrectionModeId,
): UseLintingResult {
  const [ruleRunner, setRuleRunner] = useState<RuleRunnerLike | null>(null);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [isLinting, setIsLinting] = useState(false);

  // Build the proxy in an effect so the Worker constructor is never invoked
  // during SSR. The proxy is held in state so its `null → ready` transition
  // triggers a rerender that propagates the ruleRunner into the editor.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const proxy = new RuleRunnerProxy();
    proxy.setGuidelineMap(RULE_GUIDELINE_MAP);
    setRuleRunner(proxy);

    // Load any already-installed external rulesets and subscribe to changes.
    // Both are no-ops on Web (no window.electronAPI.rulesets).
    let unsubscribeChanges: (() => void) | null = null;
    syncLoadedRulesets(proxy)
      .then(() => {
        // Subscribe AFTER initial sync so we don't double-load during startup.
        unsubscribeChanges = subscribeRulesetChanges(proxy);
      })
      .catch((err) => {
        console.error("[useLinting] external ruleset sync failed:", err);
      });

    return () => {
      unsubscribeChanges?.();
      // Don't `setRuleRunner(null)` here — StrictMode's mount → cleanup
      // → mount cycle would briefly nullify the runner between the two
      // mounts, causing dependent effects to re-run with `null` for no
      // reason. On real unmount the component is going away, so the
      // state write is wasted either way.
      proxy.dispose();
    };
  }, []);

  const handleLintIssuesUpdated = useCallback(
    (issues: LintIssue[]) => {
      if (!lintingEnabled) return;
      setLintIssues(issues);
      setIsLinting(false);
    },
    [lintingEnabled],
  );

  // Handle NLP tokenization errors — show a user-visible notification
  const handleNlpError = useCallback((error: Error) => {
    console.error("[useLinting] NLP initialization/tokenization failed:", error);
    notificationManager.warning(
      "形態素解析の初期化に失敗しました。一部の校正ルール（L2）が無効になっています。",
      15000,
    );
  }, []);

  // Disable guideline-based filtering entirely (null = no filter). The legacy
  // "適用ガイドライン" UI has been removed; rule application is now driven solely
  // by per-rule enabled config and correction-mode presets.
  useEffect(() => {
    if (!ruleRunner) return;
    ruleRunner.setActiveGuidelines(null);
  }, [ruleRunner]);

  // Clear issues + spinner when linting is disabled. `isLinting` must be
  // reset here because `handleLintIssuesUpdated` short-circuits while
  // disabled, so a refresh that was in flight when the user toggled
  // linting off would otherwise leave the loading state stuck on.
  useEffect(() => {
    if (!lintingEnabled) {
      setLintIssues([]);
      setIsLinting(false);
    }
  }, [lintingEnabled]);

  // Force re-run linting on the full document (not just visible paragraphs)
  const refreshLinting = useCallback(() => {
    if (!editorViewInstance || !lintingEnabled || !ruleRunner) return;

    setIsLinting(true);
    import("@/packages/milkdown-plugin-japanese-novel/linting-plugin")
      .then(({ updateLintingSettings }) => {
        if (!isEditorViewAlive(editorViewInstance)) {
          setIsLinting(false);
          return;
        }
        const nlpClient = ruleRunner.hasMorphologicalRules() ? getNlpClient() : null;

        updateLintingSettings(
          editorViewInstance,
          {
            ruleRunner,
            nlpClient,
          },
          "manual-refresh",
        );
      })
      .catch((err) => {
        console.error("[useLinting] Failed to refresh linting:", err);
        setIsLinting(false);
      });
  }, [editorViewInstance, lintingEnabled, ruleRunner]);

  // Sync rule configs from settings to the runner, then re-run linting so the
  // displayed issues reflect the new enabled/severity immediately.
  //
  // `setConfig()` mutates the runner in place (its reference is stable), so the
  // editor's decoration effect — keyed only on the runner reference — never
  // re-fires on a config change. Without the explicit `refreshLinting()` here,
  // disabling a rule or a whole guideline group (the inspector's EyeOff button)
  // would update the config but leave the now-stale issues on screen until the
  // next document edit, making the toggle look broken.
  useEffect(() => {
    if (!ruleRunner) return;

    // Apply user overrides from settings. `options` must be forwarded so
    // rule-specific overrides (e.g. genji-out-of-dict's
    // includeVerbsAdjectives, #2048) actually reach the rule at lint time;
    // when omitted (undefined) the runner preserves the manifest defaults.
    for (const [ruleId, config] of Object.entries(lintingRuleConfigs)) {
      ruleRunner.setConfig(ruleId, {
        enabled: config.enabled,
        severity: config.severity,
        skipDialogue: config.skipDialogue,
        options: config.options,
      });
    }

    // SET_CONFIG messages are dispatched synchronously above; refreshLinting's
    // re-lint request is posted after a dynamic import (a microtask later), so
    // the worker always sees the new config before it re-lints.
    refreshLinting();
  }, [ruleRunner, lintingRuleConfigs, refreshLinting]);

  return {
    ruleRunner,
    lintIssues,
    isLinting,
    handleLintIssuesUpdated,
    handleNlpError,
    refreshLinting,
  };
}
