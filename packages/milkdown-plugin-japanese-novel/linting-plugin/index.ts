/**
 * Linting Plugin - Entry Point
 * リンティングプラグイン - エントリーポイント
 */

import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import type { RuleRunner, LintIssue } from '@/lib/linting';
import type { INlpClient } from '@/lib/nlp-client/types';
import type { ILlmClient } from '@/lib/llm-client/types';
import type { IgnoredCorrection } from '@/lib/project-types';
import type { ConfigChangeReason } from '@/lib/linting/correction-config';
import type { LintingSettingsUpdate } from './types';
import { createLintingPlugin, lintingKey } from './decoration-plugin';

// Export the plugin key for external use
export { lintingKey } from './decoration-plugin';

export interface LintingOptions {
  /** Enable/disable linting - 有効/無効 */
  enabled?: boolean;
  /** RuleRunner instance for executing lint rules */
  ruleRunner?: RuleRunner | null;
  /** NLP client for morphological analysis (L2 rules) */
  nlpClient?: INlpClient | null;
  /** Ignored corrections to filter out from decorations */
  ignoredCorrections?: IgnoredCorrection[];
  /** Callback when lint issues are updated */
  onIssuesUpdated?: (issues: LintIssue[], options?: { llmPending?: boolean }) => void;
  /** Callback fired when NLP tokenization fails (e.g., kuromoji init error).
   *  Called once per failure episode (not per-paragraph). */
  onNlpError?: (error: Error) => void;
  /** Debounce time in milliseconds */
  debounceMs?: number;
}

/**
 * Create the Milkdown linting plugin.
 *
 * @param options Plugin options
 * @returns Milkdown plugin
 */
export function linting(options: LintingOptions = {}) {
  const {
    enabled = false,
    ruleRunner = null,
    nlpClient = null,
    onIssuesUpdated,
    onNlpError,
    debounceMs = 500,
  } = options;

  return $prose(() => createLintingPlugin({
    enabled,
    ruleRunner,
    nlpClient,
    onIssuesUpdated,
    onNlpError,
    debounceMs,
  }));
}

/**
 * Dynamically update linting settings without recreating the editor.
 *
 * @param view EditorView instance
 * @param settings Settings to update
 * @param reason Optional reason for the change, enabling smart cache invalidation
 */
export function updateLintingSettings(
  view: EditorView,
  settings: LintingSettingsUpdate,
  reason?: ConfigChangeReason
): void {
  const meta: LintingSettingsUpdate = { ...settings };
  // If a reason is provided as a separate argument, it takes precedence
  if (reason !== undefined) {
    meta.changeReason = reason;
  }
  const tr = view.state.tr.setMeta(lintingKey, meta);
  view.dispatch(tr);
}
