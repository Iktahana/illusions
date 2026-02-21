/**
 * Linting Plugin Types
 * リンティングプラグインの型定義
 */

import type { DecorationSet } from '@milkdown/prose/view';
import type { LintIssue } from '@/lib/linting';
import type { RuleRunner } from '@/lib/linting';
import type { INlpClient } from '@/lib/nlp-client/types';
import type { ILlmClient } from '@/lib/llm-client/types';

/**
 * Options for the linting ProseMirror plugin
 */
export interface LintingPluginOptions {
  enabled: boolean;
  ruleRunner: RuleRunner | null;
  nlpClient?: INlpClient | null;
  llmClient?: ILlmClient | null;
  llmEnabled?: boolean;
  onIssuesUpdated?: (issues: LintIssue[]) => void;
  debounceMs?: number;
}

/**
 * Internal plugin state managed by ProseMirror
 */
export interface LintingPluginState {
  decorations: DecorationSet;
  enabled: boolean;
}
