/**
 * Linting Plugin - Entry Point
 * リンティングプラグイン - エントリーポイント
 */

import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import type { RuleRunner, LintIssue } from '@/lib/linting';
import type { INlpClient } from '@/lib/nlp-client/types';
import type { ILlmClient } from '@/lib/llm-client/types';
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
  /** Callback when lint issues are updated */
  onIssuesUpdated?: (issues: LintIssue[]) => void;
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
    debounceMs = 500,
  } = options;

  return $prose(() => createLintingPlugin({
    enabled,
    ruleRunner,
    nlpClient,
    onIssuesUpdated,
    debounceMs,
  }));
}

/**
 * Dynamically update linting settings without recreating the editor.
 *
 * @param view EditorView instance
 * @param settings Settings to update
 */
export function updateLintingSettings(
  view: EditorView,
  settings: {
    enabled?: boolean;
    ruleRunner?: RuleRunner | null;
    nlpClient?: INlpClient | null;
    llmClient?: ILlmClient | null;
    llmEnabled?: boolean;
    forceFullScan?: boolean;
  }
): void {
  const tr = view.state.tr.setMeta(lintingKey, settings);
  view.dispatch(tr);
}
