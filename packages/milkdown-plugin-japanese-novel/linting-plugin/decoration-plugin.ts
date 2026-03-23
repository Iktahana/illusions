/**
 * ProseMirror Decoration Plugin for Linting
 * リンティング結果をエディタ内にデコレーションとして表示するプラグイン
 *
 * Follows the same viewport-aware, cached pattern as the POS highlight plugin.
 * Supports both per-paragraph rules and document-level rules.
 */

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView } from '@milkdown/prose/view';
import type { RuleRunner, LintIssue, Severity } from '@/lib/linting';
import type { INlpClient } from '@/lib/nlp-client/types';
import type { Token } from '@/lib/nlp-client/types';
import type { IgnoredCorrection } from '@/lib/project/project-types';
import { LRUCache } from '@/lib/utils/lru-cache';
import { hashString } from '@/lib/utils/hash-string';
import { getAtomOffset, collectParagraphs, findScrollContainer, getVisibleParagraphs } from '../shared/paragraph-helpers';
import type { LintingPluginState, LintingPluginOptions, LintingSettingsUpdate } from './types';

export const lintingKey = new PluginKey<LintingPluginState>('linting');

/**
 * Map severity to CSS class name for decoration styling.
 */
function severityToClass(severity: Severity): string {
  switch (severity) {
    case 'error': return 'lint-error';
    case 'warning': return 'lint-warning';
    case 'info': return 'lint-info';
  }
}

/**
 * Check if a lint issue should be filtered out based on ignored corrections.
 */
function isIssueIgnored(
  issue: LintIssue,
  issueText: string,
  paragraphText: string,
  ignoredList: IgnoredCorrection[],
): boolean {
  const paragraphHash = hashString(paragraphText);
  return ignoredList.some((ignored) => {
    if (ignored.ruleId !== issue.ruleId || ignored.text !== issueText) return false;
    // Global ignore (no context) matches everything
    if (!ignored.context) return true;
    // Context-specific: match paragraph hash
    return ignored.context === paragraphHash;
  });
}

export function createLintingPlugin(
  options: LintingPluginOptions
): Plugin<LintingPluginState> {
  const { enabled, ruleRunner, nlpClient, onIssuesUpdated, onNlpError, debounceMs = 500 } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let processingVersion = 0;

  // Current ruleRunner reference (updated dynamically via setMeta)
  let currentRuleRunner: RuleRunner | null = ruleRunner;

  // Current NLP client reference (updated dynamically via setMeta)
  let currentNlpClient: INlpClient | null = nlpClient ?? null;

  // Ignored corrections list (updated dynamically via setMeta)
  let currentIgnoredCorrections: IgnoredCorrection[] = options.ignoredCorrections ?? [];

  // NLP error state: tracks whether tokenization has failed.
  // When true, L2 (morphological) rules are explicitly disabled
  // and the user has been notified via onNlpError callback.
  let nlpErrorFired = false;

  // Lint result cache: paragraph text -> LintIssue[]
  // Minimizes rule execution and prevents flicker on scroll
  // LRU-bounded to prevent unbounded memory growth in long editing sessions
  const issueCache = new LRUCache<string, LintIssue[]>(200);

  // Token cache: paragraph text -> Token[]
  // Caches kuromoji tokenization results for L2 rules
  const tokenCache = new LRUCache<string, Token[]>(200);

  // Document-level rule cache: paragraph index -> LintIssue[]
  // Invalidated on every update since document-level rules depend on all paragraphs
  let documentIssueCache: Map<number, LintIssue[]> | null = null;

  // When true, the next scheduleViewportUpdate will scan ALL paragraphs (not just visible)
  let pendingFullScan = false;

  // When true, the next scheduleViewportUpdate skips the debounce (fires immediately)
  let immediateRebuild = false;

  return new Plugin<LintingPluginState>({
    key: lintingKey,

    state: {
      init(): LintingPluginState {
        return {
          decorations: DecorationSet.empty,
          enabled,
        };
      },

      apply(tr, pluginState): LintingPluginState {
        // Update settings via meta
        const meta = tr.getMeta(lintingKey) as (LintingSettingsUpdate & Partial<LintingPluginState>) | undefined;
        if (meta) {
          // If decorations are included, apply directly
          if (meta.decorations !== undefined) {
            return { ...pluginState, ...meta };
          }
          // Update ruleRunner reference if provided
          if ('ruleRunner' in meta) {
            currentRuleRunner = meta.ruleRunner ?? null;
            // Clear cache when runner changes (rules may have changed)
            issueCache.clear();
            tokenCache.clear();
            documentIssueCache = null;
          }
          // Update nlpClient reference if provided
          if ('nlpClient' in meta) {
            currentNlpClient = meta.nlpClient ?? null;
            // Reset NLP error state when client changes (enables retry)
            nlpErrorFired = false;
            // Clear caches when NLP client changes to avoid stale L2 results
            issueCache.clear();
            tokenCache.clear();
            documentIssueCache = null;
          }
          // Handle changeReason for smart cache invalidation
          if (meta.changeReason) {
            switch (meta.changeReason) {
              case "ignored-correction":
                // Trigger immediate decoration rebuild so ignored issues vanish instantly.
                // Issue cache stays valid (no re-run needed), we just re-filter with new ignoredCorrections.
                pendingFullScan = true;
                immediateRebuild = true;
                break;
              case "manual-refresh":
              case "mode-change":
                // Clear all caches and force a full scan
                issueCache.clear();
                tokenCache.clear();
                documentIssueCache = null;
                pendingFullScan = true;
                break;
              case "rule-config-change":
              case "guideline-change":
                // Clear issue cache and force re-run (keep token cache)
                issueCache.clear();
                documentIssueCache = null;
                pendingFullScan = true;
                break;
              case "text-edit":
                // Re-run affected paragraphs only (handled via normal doc-changed path)
                break;
            }
          }
          // Force full scan flag (legacy, kept for backward compatibility)
          if (meta.forceFullScan) {
            issueCache.clear();
            tokenCache.clear();
            documentIssueCache = null;
            pendingFullScan = true;
          }
          // Update ignoredCorrections list if provided
          if ('ignoredCorrections' in meta) {
            currentIgnoredCorrections = meta.ignoredCorrections ?? [];
          }
          // enabled/disabled change
          if (meta.enabled !== undefined) {
            issueCache.clear();
            tokenCache.clear();
            documentIssueCache = null;
          }
          const updated: LintingPluginState = {
            decorations: pluginState.decorations,
            enabled: meta.enabled ?? pluginState.enabled,
          };
          // Clear decorations when disabled
          if (meta.enabled === false) {
            updated.decorations = DecorationSet.empty;
          }
          return updated;
        }

        // If document hasn't changed, map decorations to new positions
        if (!tr.docChanged) {
          return {
            ...pluginState,
            decorations: pluginState.decorations.map(tr.mapping, tr.doc),
          };
        }

        // Document changed: keep state but schedule re-processing
        // Text-based cache in issueCache is still valid for unchanged paragraphs
        return pluginState;
      },
    },

    view(editorView) {
      let scrollTimer: ReturnType<typeof setTimeout> | null = null;

      // Identify the scroll container
      const scrollContainer = findScrollContainer(editorView.dom);

      // Scroll event handler
      const handleScroll = (): void => {
        const state = lintingKey.getState(editorView.state);
        if (!state?.enabled) return;

        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          scheduleViewportUpdate(editorView);
        }, 150);
      };

      // Add scroll listener
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

      // Run on initialization if enabled
      if (enabled && currentRuleRunner) {
        scheduleViewportUpdate(editorView);
      }

      /**
       * Process only viewport-visible paragraphs.
       * Cached paragraphs skip rule execution; only decorations are rebuilt.
       * Document-level rules are recomputed on every update.
       * When morphological rules are present, paragraphs are tokenized via NLP client.
       */
      function scheduleViewportUpdate(view: EditorView): void {
        if (debounceTimer) clearTimeout(debounceTimer);

        const version = ++processingVersion;
        const delay = immediateRebuild ? 0 : debounceMs;
        immediateRebuild = false;

        debounceTimer = setTimeout(async () => {
          const state = lintingKey.getState(view.state);
          if (!state?.enabled || !currentRuleRunner) return;

          const allParagraphs = collectParagraphs(view.state.doc);
          // Use all paragraphs if full scan was requested, otherwise viewport-only
          const isFullScan = pendingFullScan;
          if (pendingFullScan) pendingFullScan = false;
          const targetParagraphs = isFullScan
            ? allParagraphs
            : getVisibleParagraphs(view, allParagraphs, 2);

          // Check if morphological rules are active
          const hasMorphRules = currentRuleRunner.hasMorphologicalRules();
          const nlp = currentNlpClient;

          // Process uncached paragraphs (per-paragraph rules)
          const uncachedParagraphs = targetParagraphs.filter(p => !issueCache.has(p.text));

          if (uncachedParagraphs.length > 0) {
            for (const paragraph of uncachedParagraphs) {
              if (version !== processingVersion) return;

              let issues: LintIssue[];
              if (hasMorphRules && nlp && !nlpErrorFired) {
                // Get or compute tokens for L2 rules
                let tokens = tokenCache.get(paragraph.text);
                if (!tokens) {
                  try {
                    tokens = await nlp.tokenizeParagraph(paragraph.text);
                    tokenCache.set(paragraph.text, tokens);
                  } catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    console.error('[Linting] NLP tokenization failed — L2 rules disabled:', error);
                    // Fire the error callback once per failure episode
                    if (!nlpErrorFired) {
                      nlpErrorFired = true;
                      onNlpError?.(error);
                    }
                    // Fall back to L1-only rules (no tokens)
                    issues = currentRuleRunner.runAll(paragraph.text);
                    issueCache.set(paragraph.text, issues);
                    continue;
                  }
                }
                issues = currentRuleRunner.runAllWithTokens(paragraph.text, tokens);
              } else {
                // No NLP available or NLP has failed — run L1 rules only
                issues = currentRuleRunner.runAll(paragraph.text);
              }
              issueCache.set(paragraph.text, issues);
            }
          }

          if (version !== processingVersion) return;

          // Run document-level rules on all paragraphs (always recompute)
          // Document-level rules are fast (L1/L2) so recomputing is acceptable
          documentIssueCache = null;
          if (currentRuleRunner.hasDocumentRules()) {
            if (hasMorphRules && nlp && !nlpErrorFired) {
              // Tokenize all paragraphs for morphological document rules (use cache where possible)
              const paragraphsWithTokens = [];
              let docNlpFailed = false;
              for (const p of allParagraphs) {
                if (version !== processingVersion) return;
                let tokens = tokenCache.get(p.text);
                if (!tokens) {
                  try {
                    tokens = await nlp.tokenizeParagraph(p.text);
                    tokenCache.set(p.text, tokens);
                  } catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    console.error('[Linting] NLP tokenization failed during document rules — L2 rules disabled:', error);
                    if (!nlpErrorFired) {
                      nlpErrorFired = true;
                      onNlpError?.(error);
                    }
                    docNlpFailed = true;
                    break;
                  }
                }
                paragraphsWithTokens.push({ text: p.text, index: p.index, tokens });
              }
              if (!docNlpFailed) {
                documentIssueCache = currentRuleRunner.runDocumentWithTokens(paragraphsWithTokens);
              } else {
                // Fall back to L1-only document rules
                documentIssueCache = currentRuleRunner.runDocument(
                  allParagraphs.map(p => ({ text: p.text, index: p.index }))
                );
              }
            } else {
              documentIssueCache = currentRuleRunner.runDocument(
                allParagraphs.map(p => ({ text: p.text, index: p.index }))
              );
            }
          }

          if (version !== processingVersion) return;

          // Build decorations from all paragraphs that have cached results
          const allDecorations: Decoration[] = [];
          const allIssues: LintIssue[] = [];

          for (const paragraph of allParagraphs) {
            // Per-paragraph issues from cache
            const perParagraphIssues = issueCache.get(paragraph.text);
            // Document-level issues for this paragraph
            const docLevelIssues = documentIssueCache?.get(paragraph.index);

            // Combine both sources of issues
            const combinedIssues: LintIssue[] = [];
            if (perParagraphIssues) {
              combinedIssues.push(...perParagraphIssues);
            }
            if (docLevelIssues) {
              combinedIssues.push(...docLevelIssues);
            }

            if (combinedIssues.length === 0) continue;

            for (const issue of combinedIssues) {
              // Filter out ignored corrections
              const issueText = paragraph.text.slice(issue.from, issue.to);
              if (currentIgnoredCorrections.length > 0 &&
                  isIssueIgnored(issue, issueText, paragraph.text, currentIgnoredCorrections)) {
                continue;
              }

              const extraFrom = getAtomOffset(paragraph.atomAdjustments, issue.from);
              const extraTo = getAtomOffset(paragraph.atomAdjustments, issue.to);
              const from = paragraph.pos + 1 + issue.from + extraFrom;
              const to = paragraph.pos + 1 + issue.to + extraTo;

              allDecorations.push(
                Decoration.inline(from, to, {
                  class: severityToClass(issue.severity),
                  'data-lint-issue': JSON.stringify({ ...issue, from, to, originalText: issueText }),
                })
              );

              allIssues.push({
                ...issue,
                from,
                to,
                originalText: issueText,
              });
            }
          }

          // Apply decorations
          const decorations = allDecorations.length > 0
            ? DecorationSet.create(view.state.doc, allDecorations)
            : DecorationSet.empty;
          const tr = view.state.tr.setMeta(lintingKey, { decorations });
          view.dispatch(tr);

          // Notify parent of all issues
          onIssuesUpdated?.(allIssues);

        }, delay);
      }

      return {
        update(view, prevState) {
          const state = lintingKey.getState(view.state);
          const prevPluginState = lintingKey.getState(prevState);

          // enabled changed
          if (state?.enabled !== prevPluginState?.enabled) {
            if (state?.enabled) {
              issueCache.clear();
              tokenCache.clear();
              documentIssueCache = null;
              scheduleViewportUpdate(view);
            }
            return;
          }

          if (!state?.enabled) return;

          // Full scan requested (e.g. ignored corrections changed)
          if (pendingFullScan) {
            scheduleViewportUpdate(view);
            return;
          }

          // Document changed: schedule re-processing
          if (view.state.doc !== prevState.doc) {
            scheduleViewportUpdate(view);
          }
        },
        destroy() {
          if (debounceTimer) clearTimeout(debounceTimer);
          if (scrollTimer) clearTimeout(scrollTimer);
          scrollContainer.removeEventListener('scroll', handleScroll);
          issueCache.clear();
          tokenCache.clear();
          documentIssueCache = null;
        },
      };
    },

    props: {
      decorations(state) {
        const pluginState = lintingKey.getState(state);
        return pluginState?.decorations ?? DecorationSet.empty;
      },
    },
  });
}
