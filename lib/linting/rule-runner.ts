import type { ILlmClient } from "@/lib/llm-client/types";
import type { Token } from "@/lib/nlp-client/types";

import type {
  CorrectionEngine,
  LintRule,
  LintRuleConfig,
  LintIssue,
  AnalysisContext,
  CorrectionCandidate,
  CorrectionRule,
} from "./types";
import {
  isDocumentLintRule,
  isLlmLintRule,
  isMorphologicalLintRule,
  isMorphologicalDocumentLintRule,
} from "./types";

/**
 * Manages lint rule registration, configuration, and execution.
 */
export class RuleRunner {
  private rules: Map<string, LintRule> = new Map();
  private configs: Map<string, LintRuleConfig> = new Map();

  /** Register a rule. Sets default config if none exists yet. */
  registerRule(rule: LintRule): void {
    this.rules.set(rule.id, rule);
    if (!this.configs.has(rule.id)) {
      this.configs.set(rule.id, { ...rule.defaultConfig });
    }
  }

  /** Update the config for a specific rule. */
  setConfig(ruleId: string, config: LintRuleConfig): void {
    this.configs.set(ruleId, config);
  }

  /** Get the current config for a specific rule. */
  getConfig(ruleId: string): LintRuleConfig | undefined {
    return this.configs.get(ruleId);
  }

  /** Run all enabled rules on the given text. Returns issues sorted by position. */
  runAll(text: string): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const rule of this.rules.values()) {
      const config = this.configs.get(rule.id);
      if (!config?.enabled) continue;
      issues.push(...rule.lint(text, config));
    }

    return issues.sort((a, b) => a.from - b.from);
  }

  /** Run a specific rule on the given text. Respects enabled status. */
  run(ruleId: string, text: string): LintIssue[] {
    const rule = this.rules.get(ruleId);
    if (!rule) return [];

    const config = this.configs.get(ruleId);
    if (!config?.enabled) return [];

    return rule.lint(text, config);
  }

  /** Run document-level rules on all paragraphs. Returns issues grouped by paragraph index. */
  runDocument(
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
  ): Map<number, LintIssue[]> {
    const results = new Map<number, LintIssue[]>();

    for (const rule of this.rules.values()) {
      if (!isDocumentLintRule(rule)) continue;
      const config = this.configs.get(rule.id);
      if (!config?.enabled) continue;

      const ruleResults = rule.lintDocument(paragraphs, config);
      for (const { paragraphIndex, issues } of ruleResults) {
        const existing = results.get(paragraphIndex) ?? [];
        existing.push(...issues);
        results.set(paragraphIndex, existing);
      }
    }

    return results;
  }

  /** Check if any registered rule is a document-level rule. */
  hasDocumentRules(): boolean {
    for (const rule of this.rules.values()) {
      if (isDocumentLintRule(rule)) return true;
    }
    return false;
  }

  /** Return all registered rules. */
  getRegisteredRules(): LintRule[] {
    return Array.from(this.rules.values());
  }

  /** Return only rules whose config has enabled=true. */
  getEnabledRules(): LintRule[] {
    return Array.from(this.rules.values()).filter((rule) => {
      const config = this.configs.get(rule.id);
      return config?.enabled === true;
    });
  }

  /**
   * Run all enabled rules, using tokens for L2 rules.
   * L1 rules use `lint()`, L2 rules use `lintWithTokens()`.
   */
  runAllWithTokens(text: string, tokens: ReadonlyArray<Token>): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const rule of this.rules.values()) {
      const config = this.configs.get(rule.id);
      if (!config?.enabled) continue;

      if (isMorphologicalLintRule(rule)) {
        issues.push(...rule.lintWithTokens(text, tokens, config));
      } else {
        issues.push(...rule.lint(text, config));
      }
    }

    return issues.sort((a, b) => a.from - b.from);
  }

  /**
   * Run document-level rules with tokens.
   * Routes morphological document rules through lintDocumentWithTokens(),
   * and regular document rules through lintDocument().
   */
  runDocumentWithTokens(
    paragraphs: ReadonlyArray<{
      text: string;
      index: number;
      tokens: ReadonlyArray<Token>;
    }>,
  ): Map<number, LintIssue[]> {
    const results = new Map<number, LintIssue[]>();

    for (const rule of this.rules.values()) {
      const config = this.configs.get(rule.id);
      if (!config?.enabled) continue;

      let ruleResults: Array<{ paragraphIndex: number; issues: LintIssue[] }>;

      if (isMorphologicalDocumentLintRule(rule)) {
        ruleResults = rule.lintDocumentWithTokens(paragraphs, config);
      } else if (isDocumentLintRule(rule)) {
        // Strip tokens for non-morphological document rules
        ruleResults = rule.lintDocument(
          paragraphs.map((p) => ({ text: p.text, index: p.index })),
          config,
        );
      } else {
        continue;
      }

      for (const { paragraphIndex, issues } of ruleResults) {
        const existing = results.get(paragraphIndex) ?? [];
        existing.push(...issues);
        results.set(paragraphIndex, existing);
      }
    }

    return results;
  }

  /** Check if any registered rule requires morphological analysis. */
  hasMorphologicalRules(): boolean {
    for (const rule of this.rules.values()) {
      const config = this.configs.get(rule.id);
      if (!config?.enabled) continue;
      if (isMorphologicalLintRule(rule) || isMorphologicalDocumentLintRule(rule)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if any enabled rule requires LLM inference.
   */
  hasLlmRules(): boolean {
    for (const [id, rule] of this.rules) {
      const config = this.configs.get(id);
      if (config?.enabled && isLlmLintRule(rule)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns all rules for the given engine type.
   * Engine field acts as implementation metadata, not architectural boundary.
   */
  getRulesByEngine(engine: CorrectionEngine): LintRule[] {
    return Array.from(this.rules.values()).filter(r => r.engine === engine);
  }

  /**
   * Checks whether any enabled rules use the given engine.
   */
  hasRulesForEngine(engine: CorrectionEngine): boolean {
    return Array.from(this.rules.values()).some(r => this.configs.get(r.id)?.enabled !== false && r.engine === engine);
  }

  /**
   * Run all enabled L3 (LLM) rules on the given sentences.
   * Returns aggregated issues from all L3 rules.
   */
  async runLlmRules(
    sentences: ReadonlyArray<{ text: string; from: number; to: number }>,
    llmClient: ILlmClient,
    signal?: AbortSignal,
  ): Promise<LintIssue[]> {
    const allIssues: LintIssue[] = [];

    for (const [id, rule] of this.rules) {
      if (signal?.aborted) break;

      const config = this.configs.get(id);
      if (!config?.enabled) continue;
      if (!isLlmLintRule(rule)) continue;

      try {
        const issues = await rule.lintWithLlm(
          sentences,
          config,
          llmClient,
          signal,
        );
        allIssues.push(...issues);
      } catch (error) {
        if ((error as Error).name === "AbortError") break;
        console.error(`L3 rule "${id}" failed:`, error);
        // Don't let one rule failure break all L3 linting
      }
    }

    return allIssues.sort((a, b) => a.from - b.from);
  }
}

// ============================================================================
// CorrectionRuleRunner (Phase D)
// ============================================================================

/**
 * Unified rule runner for the new CorrectionRule interface.
 * Provides a single code path — no L1/L2/L3 branching.
 *
 * Run in parallel with the legacy RuleRunner during migration;
 * once all rules are migrated, RuleRunner can be removed.
 */
export class CorrectionRuleRunner {
  private rules = new Map<string, CorrectionRule>();
  private configs = new Map<string, LintRuleConfig>();

  /** Register a rule. Uses the rule's defaultConfig if none has been set yet. */
  register(rule: CorrectionRule): void {
    this.rules.set(rule.id, rule);
    if (!this.configs.has(rule.id)) {
      this.configs.set(rule.id, { ...rule.defaultConfig });
    }
  }

  /** Partially override the config for a specific rule. */
  setConfig(ruleId: string, config: Partial<LintRuleConfig>): void {
    const existing = this.configs.get(ruleId) ?? { enabled: true, severity: "warning" as const };
    this.configs.set(ruleId, { ...existing, ...config });
  }

  /** Get the current merged config for a rule. */
  getConfig(ruleId: string): LintRuleConfig {
    return this.configs.get(ruleId) ?? { enabled: true, severity: "warning" as const };
  }

  /** Run all enabled paragraph-scope rules against the given context. */
  analyzeParagraph(context: AnalysisContext): CorrectionCandidate[] {
    const results: CorrectionCandidate[] = [];
    for (const rule of this.rules.values()) {
      const config = this.getConfig(rule.id);
      if (!config.enabled) continue;
      if (rule.scope !== "paragraph") continue;
      // Skip morphological rules when no tokens are available
      if (rule.engine === "morphological" && !context.tokens) continue;
      try {
        results.push(...rule.analyze(context, config));
      } catch (e) {
        console.error(`[CorrectionRuleRunner] Rule "${rule.id}" error:`, e);
      }
    }
    return results;
  }

  /** Run all enabled document-scope rules against the given context. */
  analyzeDocument(context: AnalysisContext): CorrectionCandidate[] {
    const results: CorrectionCandidate[] = [];
    for (const rule of this.rules.values()) {
      const config = this.getConfig(rule.id);
      if (!config.enabled) continue;
      if (rule.scope !== "document") continue;
      if (rule.engine === "morphological" && !context.tokens) continue;
      try {
        results.push(...rule.analyze(context, config));
      } catch (e) {
        console.error(`[CorrectionRuleRunner] Rule "${rule.id}" error:`, e);
      }
    }
    return results;
  }

  /** Return all registered rules. */
  getRegisteredRules(): CorrectionRule[] {
    return Array.from(this.rules.values());
  }

  /** Return only enabled rules. */
  getEnabledRules(): CorrectionRule[] {
    return Array.from(this.rules.values()).filter(
      (rule) => this.getConfig(rule.id).enabled,
    );
  }
}
