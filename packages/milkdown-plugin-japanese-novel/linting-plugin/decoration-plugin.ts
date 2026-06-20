/**
 * ProseMirror Decoration Plugin for Linting
 * リンティング結果をエディタ内にデコレーションとして表示するプラグイン
 *
 * Follows the same viewport-aware, cached pattern as the POS highlight plugin.
 * Supports both per-paragraph rules and document-level rules.
 */

import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";
import type { LintIssue, Severity } from "@/lib/linting";
import type { INlpClient } from "@/lib/nlp-client/types";
import type { Token } from "@/lib/nlp-client/types";
import type { IgnoredCorrection } from "@/lib/project/project-types";
import { LRUCache } from "@/shared/lib/lru-cache";
import { hashString } from "@/shared/lib/hash-string";
import { getAtomOffset, collectParagraphs } from "../shared/paragraph-helpers";
import type {
  LintingPluginState,
  LintingPluginOptions,
  LintingSettingsUpdate,
  RuleRunnerLike,
} from "./types";
import { isSilentCancelError } from "./worker/protocol";

export const lintingKey = new PluginKey<LintingPluginState>("linting");

/**
 * Map severity to CSS class name for decoration styling.
 */
function severityToClass(severity: Severity): string {
  switch (severity) {
    case "error":
      return "lint-error";
    case "warning":
      return "lint-warning";
    case "info":
      return "lint-info";
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

export function createLintingPlugin(options: LintingPluginOptions): Plugin<LintingPluginState> {
  const { enabled, ruleRunner, nlpClient, onIssuesUpdated, onNlpError, debounceMs = 500 } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let processingVersion = 0;

  // Current ruleRunner reference (updated dynamically via setMeta)
  let currentRuleRunner: RuleRunnerLike | null = ruleRunner;

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
        const meta = tr.getMeta(lintingKey) as
          | (LintingSettingsUpdate & Partial<LintingPluginState>)
          | undefined;
        if (meta) {
          // If decorations are included, apply directly
          if (meta.decorations !== undefined) {
            return { ...pluginState, ...meta };
          }
          // Update ruleRunner reference if provided
          if ("ruleRunner" in meta) {
            currentRuleRunner = meta.ruleRunner ?? null;
            // Clear cache when runner changes (rules may have changed)
            issueCache.clear();
            tokenCache.clear();
            documentIssueCache = null;
          }
          // Update nlpClient reference if provided
          if ("nlpClient" in meta) {
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
                // Drop any in-flight worker batch — its results would be stale.
                currentRuleRunner?.cancelInFlight();
                break;
              case "rule-config-change":
              case "guideline-change":
                // Clear issue cache and force re-run (keep token cache)
                issueCache.clear();
                documentIssueCache = null;
                pendingFullScan = true;
                currentRuleRunner?.cancelInFlight();
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
            currentRuleRunner?.cancelInFlight();
          }
          // Update ignoredCorrections list if provided
          if ("ignoredCorrections" in meta) {
            currentIgnoredCorrections = meta.ignoredCorrections ?? [];
          }
          // enabled/disabled change
          if (meta.enabled !== undefined) {
            issueCache.clear();
            tokenCache.clear();
            documentIssueCache = null;
            // Bump the version so any in-flight async tokenization /
            // runBatch awaits bail at their next `version !==
            // processingVersion` check, preventing decorations from
            // being repopulated after the user disabled linting.
            processingVersion++;
          }
          const updated: LintingPluginState = {
            decorations: pluginState.decorations,
            enabled: meta.enabled ?? pluginState.enabled,
          };
          // Clear decorations when disabled
          if (meta.enabled === false) {
            updated.decorations = DecorationSet.empty;
            // Stop any in-flight worker batch — we no longer want its results.
            currentRuleRunner?.cancelInFlight();
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
          // Always process against the current full document to avoid
          // scroll-driven viewport recomputation causing layout jitter.
          if (pendingFullScan) pendingFullScan = false;
          const targetParagraphs = allParagraphs;

          // Check if morphological rules are active
          const hasMorphRules = currentRuleRunner.hasMorphologicalRules();
          const nlp = currentNlpClient;

          // Tokenize the paragraphs that morphological rules need.
          // Tokenization stays on the main thread because the NLP client
          // depends on `window.electronAPI.nlp.*` (Worker-unreachable).
          //
          // We tokenize uncached paragraphs eagerly. For paragraphs that
          // are cached for per-paragraph rules but still needed for
          // document-level morph rules, we look up tokenCache and
          // tokenize the misses.
          const useTokens = hasMorphRules && nlp && !nlpErrorFired;
          const tokensByText = new Map<string, ReadonlyArray<Token>>();

          async function tokenizeIfNeeded(text: string): Promise<ReadonlyArray<Token> | undefined> {
            // Re-check `nlpErrorFired` on every call so the first failure
            // in a batch short-circuits the rest — otherwise a long doc
            // with a broken NLP backend incurs one failed IPC per paragraph.
            if (!useTokens || nlpErrorFired) return undefined;
            const cached = tokenCache.get(text);
            if (cached) return cached;
            try {
              const fresh = await nlp!.tokenizeParagraph(text);
              tokenCache.set(text, fresh);
              return fresh;
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              console.error("[Linting] NLP tokenization failed — L2 rules disabled:", error);
              if (!nlpErrorFired) {
                nlpErrorFired = true;
                onNlpError?.(error);
              }
              return undefined;
            }
          }

          // Find paragraphs that need fresh per-paragraph rule execution.
          const uncachedParagraphs = targetParagraphs.filter((p) => !issueCache.has(p.text));

          // Per-paragraph morph rules need tokens for uncached paragraphs only
          // (cached results are reused). Document-level morph rules need tokens
          // for the full document. Pre-tokenize the union — the second case is
          // skipped when no document-level morph rule is enabled, avoiding a
          // full-document NLP sweep on every keystroke.
          const allTokenTexts = new Set<string>();
          for (const p of uncachedParagraphs) allTokenTexts.add(p.text);
          if (currentRuleRunner.hasMorphologicalDocumentRules()) {
            for (const p of allParagraphs) allTokenTexts.add(p.text);
          }
          for (const text of allTokenTexts) {
            if (version !== processingVersion) return;
            const tokens = await tokenizeIfNeeded(text);
            if (tokens) tokensByText.set(text, tokens);
          }

          if (version !== processingVersion) return;

          // Build the per-paragraph batch (uncached only). The runner
          // will route through the worker for L1 + main thread for L2
          // morph; results merge transparently.
          //
          // On a real (non-cancellation) error we log and fall through
          // rather than `return`-ing — otherwise the failure leaves
          // `isLinting` stuck because `onIssuesUpdated` is never called
          // and the "全文を再検査" control sticks in its loading state.
          if (uncachedParagraphs.length > 0) {
            const perParaInputs = uncachedParagraphs.map((p) => ({
              text: p.text,
              index: p.index,
              tokens: tokensByText.get(p.text),
            }));
            try {
              const resp = await currentRuleRunner.runBatch({
                paragraphs: perParaInputs,
                mode: "per-paragraph",
                version,
              });
              if (version !== processingVersion) return;
              for (const p of uncachedParagraphs) {
                const issues = resp.perParagraph.get(p.index) ?? [];
                issueCache.set(p.text, issues);
              }
            } catch (err) {
              if (isSilentCancelError(err)) return;
              console.error("[Linting] per-paragraph runBatch failed:", err);
              // Fall through with cached results so isLinting clears.
            }
          }

          if (version !== processingVersion) return;

          // Document-level rules always re-run against all paragraphs.
          documentIssueCache = null;
          if (currentRuleRunner.hasDocumentRules()) {
            const docInputs = allParagraphs.map((p) => ({
              text: p.text,
              index: p.index,
              tokens: tokensByText.get(p.text),
            }));
            try {
              const resp = await currentRuleRunner.runBatch({
                paragraphs: docInputs,
                mode: "document",
                version,
              });
              if (version !== processingVersion) return;
              documentIssueCache = resp.document;
            } catch (err) {
              if (isSilentCancelError(err)) return;
              console.error("[Linting] document runBatch failed:", err);
              // Fall through with documentIssueCache=null so isLinting clears.
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
              if (
                currentIgnoredCorrections.length > 0 &&
                isIssueIgnored(issue, issueText, paragraph.text, currentIgnoredCorrections)
              ) {
                continue;
              }

              const extraFrom = getAtomOffset(paragraph.atomAdjustments, issue.from);
              const extraTo = getAtomOffset(paragraph.atomAdjustments, issue.to);
              const from = paragraph.pos + 1 + issue.from + extraFrom;
              const to = paragraph.pos + 1 + issue.to + extraTo;

              allDecorations.push(
                Decoration.inline(from, to, {
                  class: severityToClass(issue.severity),
                  "data-lint-issue": JSON.stringify({
                    ...issue,
                    from,
                    to,
                    originalText: issueText,
                  }),
                }),
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
          const decorations =
            allDecorations.length > 0
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
