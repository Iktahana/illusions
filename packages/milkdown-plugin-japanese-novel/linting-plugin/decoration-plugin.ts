/**
 * ProseMirror Decoration Plugin for Linting
 * リンティング結果をエディタ内にデコレーションとして表示するプラグイン
 *
 * Follows the same viewport-aware, cached pattern as the POS highlight plugin.
 * Supports both per-paragraph rules and document-level rules.
 */

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import type { RuleRunner, LintIssue, Severity } from '@/lib/linting';
import type { INlpClient } from '@/lib/nlp-client/types';
import type { Token } from '@/lib/nlp-client/types';
import type { ILlmClient } from '@/lib/llm-client/types';
import type { IgnoredCorrection } from '@/lib/project-types';
import { LRUCache } from '@/lib/utils/lru-cache';
import type { LintingPluginState, LintingPluginOptions } from './types';

export const lintingKey = new PluginKey<LintingPluginState>('linting');

/**
 * Atom node (e.g. ruby) position adjustment information.
 * Atom nodes occupy positions in ProseMirror but are not in textContent.
 */
interface AtomAdjustment {
  textPos: number;       // Position in textContent (just before the atom)
  cumulativeOffset: number; // Cumulative additional offset
}

/**
 * Paragraph information
 */
interface ParagraphInfo {
  node: ProseMirrorNode;
  pos: number;  // Paragraph start position
  text: string; // Text content of the paragraph
  atomAdjustments: AtomAdjustment[]; // Atom node position adjustments
  index: number; // Paragraph index (0-based)
}

/**
 * Get additional offset for converting textContent position to ProseMirror paragraph offset.
 */
function getAtomOffset(adjustments: AtomAdjustment[], textPos: number): number {
  let offset = 0;
  for (const adj of adjustments) {
    if (adj.textPos <= textPos) {
      offset = adj.cumulativeOffset;
    } else {
      break;
    }
  }
  return offset;
}

/**
 * Collect paragraphs from the document.
 * Also computes atom node position adjustment information.
 */
function collectParagraphs(doc: ProseMirrorNode): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  let index = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent) {
      const atomAdjustments: AtomAdjustment[] = [];
      let textPos = 0;
      let cumulativeOffset = 0;

      node.forEach((child) => {
        if (child.isText) {
          textPos += child.text!.length;
        } else {
          // Atom or other non-text inline node
          // Occupies nodeSize positions in ProseMirror but not in textContent
          cumulativeOffset += child.nodeSize;
          atomAdjustments.push({ textPos, cumulativeOffset });
        }
      });

      paragraphs.push({
        node,
        pos,
        text: node.textContent,
        atomAdjustments,
        index: index++,
      });
      return false; // Do not descend into children
    }
    return true;
  });

  return paragraphs;
}

/**
 * Find the actual scroll container of the editor.
 * Traverses parents from the ProseMirror DOM to find an element with overflow: auto/scroll.
 */
function findScrollContainer(el: HTMLElement): HTMLElement {
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (style.overflowX === 'auto' || style.overflowX === 'scroll' ||
        style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return el;
}

/**
 * Get paragraphs visible in the viewport (including buffer of 2 paragraphs before/after).
 * Uses coordsAtPos which works correctly for both horizontal and vertical writing.
 */
function getVisibleParagraphs(
  view: EditorView,
  allParagraphs: ParagraphInfo[],
  buffer: number = 2
): ParagraphInfo[] {
  if (allParagraphs.length === 0) return [];

  const scrollContainer = findScrollContainer(view.dom);
  const containerRect = scrollContainer.getBoundingClientRect();
  const visibleIndices = new Set<number>();

  for (const paragraph of allParagraphs) {
    try {
      // +1 to get coordinates inside the paragraph node
      const coords = view.coordsAtPos(paragraph.pos + 1);
      if (coords) {
        // coordsAtPos returns viewport coordinates
        // Check intersection with the container's visible area
        if (coords.top < containerRect.bottom && coords.bottom > containerRect.top &&
            coords.left < containerRect.right && coords.right > containerRect.left) {
          visibleIndices.add(paragraph.index);
        }
      }
    } catch {
      // Skip if coordsAtPos throws an error
    }
  }

  // Also include the paragraph at cursor position
  const { from } = view.state.selection;
  for (const paragraph of allParagraphs) {
    if (from >= paragraph.pos && from <= paragraph.pos + paragraph.node.nodeSize) {
      visibleIndices.add(paragraph.index);
      break;
    }
  }

  // Fallback: if no visible paragraphs found, use first 5
  if (visibleIndices.size === 0) {
    for (let i = 0; i < Math.min(5, allParagraphs.length); i++) {
      visibleIndices.add(i);
    }
  }

  // Expand with buffer
  const expandedIndices = new Set<number>();
  for (const index of visibleIndices) {
    for (let i = Math.max(0, index - buffer); i <= Math.min(allParagraphs.length - 1, index + buffer); i++) {
      expandedIndices.add(i);
    }
  }

  return allParagraphs.filter(p => expandedIndices.has(p.index));
}

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
 * Create the linting ProseMirror plugin.
 */
/**
 * Simple string hash matching the one in use-ignored-corrections.ts.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return (hash >>> 0).toString(16);
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
  const { enabled, ruleRunner, nlpClient, onIssuesUpdated, debounceMs = 500 } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let processingVersion = 0;

  // Current ruleRunner reference (updated dynamically via setMeta)
  let currentRuleRunner: RuleRunner | null = ruleRunner;

  // Current NLP client reference (updated dynamically via setMeta)
  let currentNlpClient: INlpClient | null = nlpClient ?? null;

  // Ignored corrections list (updated dynamically via setMeta)
  let currentIgnoredCorrections: IgnoredCorrection[] = options.ignoredCorrections ?? [];

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

  // L3 (LLM) state
  let currentLlmClient: ILlmClient | null = options.llmClient ?? null;
  let llmEnabled = options.llmEnabled ?? false;
  let llmAbortController: AbortController | null = null;
  let llmIssueCache: Map<number, LintIssue[]> | null = null;
  let llmDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const LLM_DEBOUNCE_MS = 8000;
  let llmInFlight = false;

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
        const meta = tr.getMeta(lintingKey) as Partial<LintingPluginState & { ruleRunner?: RuleRunner | null; nlpClient?: INlpClient | null; llmClient?: ILlmClient | null; llmEnabled?: boolean; forceFullScan?: boolean; ignoredCorrections?: IgnoredCorrection[] }> | undefined;
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
            // Clear caches when NLP client changes to avoid stale L2 results
            issueCache.clear();
            tokenCache.clear();
            documentIssueCache = null;
          }
          // Update llmClient reference if provided
          if ('llmClient' in meta) {
            currentLlmClient = meta.llmClient ?? null;
          }
          // Update llmEnabled flag if provided
          if ('llmEnabled' in meta) {
            const wasEnabled = llmEnabled;
            llmEnabled = meta.llmEnabled ?? false;

            if (wasEnabled && !llmEnabled) {
              // L3 just disabled — cancel everything and unload
              if (llmAbortController) llmAbortController.abort();
              if (llmDebounceTimer) clearTimeout(llmDebounceTimer);
              llmIssueCache = null;
              llmInFlight = false;
              currentLlmClient?.unloadModel().catch(console.error);
            }
          }
          // Force full scan flag
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
              if (hasMorphRules && nlp) {
                // Get or compute tokens for L2 rules
                let tokens = tokenCache.get(paragraph.text);
                if (!tokens) {
                  try {
                    tokens = await nlp.tokenizeParagraph(paragraph.text);
                    tokenCache.set(paragraph.text, tokens);
                  } catch (err) {
                    console.warn('[Linting] Tokenization failed, falling back to empty tokens:', err);
                    tokens = [];
                  }
                }
                issues = currentRuleRunner.runAllWithTokens(paragraph.text, tokens);
              } else {
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
            if (hasMorphRules && nlp) {
              // Tokenize all paragraphs for morphological document rules (use cache where possible)
              const paragraphsWithTokens = [];
              for (const p of allParagraphs) {
                if (version !== processingVersion) return;
                let tokens = tokenCache.get(p.text);
                if (!tokens) {
                  try {
                    tokens = await nlp.tokenizeParagraph(p.text);
                    tokenCache.set(p.text, tokens);
                  } catch {
                    tokens = [];
                  }
                }
                paragraphsWithTokens.push({ text: p.text, index: p.index, tokens });
              }
              documentIssueCache = currentRuleRunner.runDocumentWithTokens(paragraphsWithTokens);
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

              // Collect issues with absolute positions for the callback
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

          // Schedule L3 (LLM) linting with longer debounce
          scheduleLlmUpdate(view, allParagraphs);

        }, debounceMs);
      }

      /**
       * Schedule L3 (LLM) linting with a long debounce.
       * L3 results are merged with existing L1/L2 decorations when they arrive.
       */
      function scheduleLlmUpdate(
        view: EditorView,
        allParagraphs: ParagraphInfo[],
      ): void {
        if (!llmEnabled || !currentLlmClient || !currentRuleRunner?.hasLlmRules()) return;
        if (llmInFlight) return;

        if (llmDebounceTimer) clearTimeout(llmDebounceTimer);

        llmDebounceTimer = setTimeout(async () => {
          const version = processingVersion;
          llmInFlight = true;

          if (llmAbortController) llmAbortController.abort();
          llmAbortController = new AbortController();

          try {
            // Build sentences from paragraphs with document-absolute positions
            const sentences: Array<{ text: string; from: number; to: number }> = [];
            for (const para of allParagraphs) {
              if (para.text.trim().length === 0) continue;
              // +1 to skip the paragraph node open token
              const from = para.pos + 1;
              const to = from + para.text.length;
              sentences.push({ text: para.text, from, to });
            }

            if (sentences.length === 0) return;

            const issues = await currentRuleRunner!.runLlmRules(
              sentences,
              currentLlmClient!,
              llmAbortController!.signal,
            );

            // Staleness check
            if (processingVersion !== version) return;

            // Group issues by paragraph index
            llmIssueCache = new Map();
            for (const issue of issues) {
              // Find which paragraph this issue belongs to
              for (let i = 0; i < allParagraphs.length; i++) {
                const para = allParagraphs[i];
                const paraFrom = para.pos + 1;
                const paraTo = paraFrom + para.text.length;
                if (issue.from >= paraFrom && issue.to <= paraTo) {
                  const existing = llmIssueCache.get(i) ?? [];
                  existing.push(issue);
                  llmIssueCache.set(i, existing);
                  break;
                }
              }
            }

            // Rebuild decorations with L3 issues merged in
            rebuildDecorationsWithLlm(view, allParagraphs);
          } catch (error) {
            if ((error as Error).name !== "AbortError") {
              console.error("L3 linting failed:", error);
            }
          } finally {
            llmInFlight = false;
          }
        }, LLM_DEBOUNCE_MS);
      }

      /**
       * Rebuild decorations merging L1/L2 cached issues + L3 (LLM) cached issues.
       * Called when L3 results arrive asynchronously after L1/L2 decorations are already shown.
       */
      function rebuildDecorationsWithLlm(
        view: EditorView,
        allParagraphs: ParagraphInfo[],
      ): void {
        const allDecorations: Decoration[] = [];
        const allIssues: LintIssue[] = [];

        for (let i = 0; i < allParagraphs.length; i++) {
          const paragraph = allParagraphs[i];

          // L1/L2 per-paragraph issues from cache
          const perParagraphIssues = issueCache.get(paragraph.text);
          // L1/L2 document-level issues for this paragraph
          const docLevelIssues = documentIssueCache?.get(paragraph.index);

          // Combine L1/L2 sources
          const combinedIssues: LintIssue[] = [];
          if (perParagraphIssues) {
            combinedIssues.push(...perParagraphIssues);
          }
          if (docLevelIssues) {
            combinedIssues.push(...docLevelIssues);
          }

          // L1/L2 issues (paragraph-relative positions)
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

            allIssues.push({ ...issue, from, to, originalText: issueText });
          }

          // L3 issues from LLM cache (already have absolute positions)
          const llmIssues = llmIssueCache?.get(i);
          if (llmIssues) {
            for (const issue of llmIssues) {
              if (issue.from < issue.to) {
                // Filter out ignored L3 corrections
                const l3IssueText = paragraph.text.slice(
                  issue.from - (paragraph.pos + 1),
                  issue.to - (paragraph.pos + 1),
                );
                if (currentIgnoredCorrections.length > 0 &&
                    isIssueIgnored(issue, l3IssueText, paragraph.text, currentIgnoredCorrections)) {
                  continue;
                }
                const issueWithOriginal = { ...issue, originalText: l3IssueText };
                allDecorations.push(
                  Decoration.inline(issue.from, issue.to, {
                    class: severityToClass(issue.severity),
                    'data-lint-issue': JSON.stringify(issueWithOriginal),
                  })
                );

                allIssues.push(issueWithOriginal);
              }
            }
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

          // Document changed: schedule re-processing
          if (view.state.doc !== prevState.doc) {
            scheduleViewportUpdate(view);
          }
        },
        destroy() {
          if (debounceTimer) clearTimeout(debounceTimer);
          if (scrollTimer) clearTimeout(scrollTimer);
          if (llmDebounceTimer) clearTimeout(llmDebounceTimer);
          if (llmAbortController) llmAbortController.abort();
          scrollContainer.removeEventListener('scroll', handleScroll);
          issueCache.clear();
          tokenCache.clear();
          documentIssueCache = null;
          llmIssueCache = null;
          llmInFlight = false;
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
