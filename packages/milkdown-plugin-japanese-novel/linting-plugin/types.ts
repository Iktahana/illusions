/**
 * Linting Plugin Types
 * リンティングプラグインの型定義
 */

import type { DecorationSet } from '@milkdown/prose/view';
import type { LintIssue } from '@/lib/linting';
import type { RuleRunner } from '@/lib/linting';
import type { INlpClient } from '@/lib/nlp-client/types';
import type { ILlmClient } from '@/lib/llm-client/types';
import type { IgnoredCorrection } from '@/lib/project-types';
import type { ConfigChangeReason } from '@/lib/linting/correction-config';

export type { ConfigChangeReason };

/**
 * Options for the linting ProseMirror plugin
 */
export interface LintingPluginOptions {
  enabled: boolean;
  ruleRunner: RuleRunner | null;
  nlpClient?: INlpClient | null;
  llmClient?: ILlmClient | null;
  llmEnabled?: boolean;
  ignoredCorrections?: IgnoredCorrection[];
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

/**
 * Settings that can be passed to updateLintingSettings().
 * The optional changeReason enables smart cache invalidation.
 */
export interface LintingSettingsUpdate {
  enabled?: boolean;
  ruleRunner?: RuleRunner | null;
  nlpClient?: INlpClient | null;
  llmClient?: ILlmClient | null;
  llmEnabled?: boolean;
  /** @deprecated Use changeReason instead */
  forceFullScan?: boolean;
  ignoredCorrections?: IgnoredCorrection[];
  /** Identifies the trigger for this change, enabling precise cache invalidation */
  changeReason?: ConfigChangeReason;
}
