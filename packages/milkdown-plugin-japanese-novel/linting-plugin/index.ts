/**
 * Linting Plugin - Entry Point
 * リンティングプラグイン - エントリーポイント
 */

import { $prose } from '@milkdown/utils';
import { createLintingPlugin, lintingKey } from './decoration-plugin';
import type { EditorView } from '@milkdown/prose/view';
import type { RuleRunner, LintIssue } from '@/lib/linting';

// Export the plugin key for external use
export { lintingKey } from './decoration-plugin';

export interface LintingOptions {
  /** Enable/disable linting - 有効/無効 */
  enabled?: boolean;
  /** RuleRunner instance for executing lint rules */
  ruleRunner?: RuleRunner | null;
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
    onIssuesUpdated,
    debounceMs = 500,
  } = options;

  console.log('[Linting] Plugin initialized');

  return $prose(() => createLintingPlugin({
    enabled,
    ruleRunner,
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
  settings: { enabled?: boolean; ruleRunner?: RuleRunner | null }
): void {
  const tr = view.state.tr.setMeta(lintingKey, settings);
  view.dispatch(tr);
}
