import { describe, it, expect } from "vitest";

import type { Token } from "@/lib/nlp-client/types";
import type { LintRuleConfig } from "../types";
import { createGendaiKanazukaiL2Rules } from "../rules/l2/gendai-kanazukai-l2-rules";
import type { AbstractMorphologicalLintRule } from "../base-rule";

const DEFAULT_CONFIG: LintRuleConfig = { enabled: true, severity: "error" };

/** Helper to create a minimal token */
function tok(surface: string, pos: string, start: number, opts?: Partial<Token>): Token {
  return {
    surface,
    pos,
    start,
    end: start + surface.length,
    ...opts,
  };
}

function findRule(id: string): AbstractMorphologicalLintRule {
  const rules = createGendaiKanazukaiL2Rules();
  const rule = rules.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  return rule;
}

// ---------------------------------------------------------------------------
// gk-2-1-particle-o
// ---------------------------------------------------------------------------
describe("gk-2-1-particle-o (L2)", () => {
  const rule = findRule("gk-2-1-particle-o");

  it("should flag お recognized as a particle by kuromoji", () => {
    // 「本お読む」 — kuromoji somehow parses お as 助詞
    const text = "本お読む";
    const tokens: Token[] = [tok("本", "名詞", 0), tok("お", "助詞", 1), tok("読む", "動詞", 2)];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(1);
    expect(issues[0].from).toBe(1);
    expect(issues[0].fix?.replacement).toBe("を");
  });

  it("should flag standalone お between content words", () => {
    // 「本お読む」 — kuromoji might not recognize お as a particle
    const text = "本お読む";
    const tokens: Token[] = [
      tok("本", "名詞", 0),
      tok("お", "記号", 1), // kuromoji doesn't recognize as particle
      tok("読む", "動詞", 2),
    ];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(1);
  });

  it("should NOT flag prefix お (お茶, お水)", () => {
    const text = "お茶を飲む";
    const tokens: Token[] = [
      tok("お", "接頭詞", 0),
      tok("茶", "名詞", 1),
      tok("を", "助詞", 2),
      tok("飲む", "動詞", 3),
    ];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("should NOT flag お in おおきい (part of a larger token)", () => {
    const text = "おおきい";
    // kuromoji tokenizes おおきい as a single token
    const tokens: Token[] = [tok("おおきい", "形容詞", 0)];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("should NOT flag interjection お", () => {
    const text = "お、すごい";
    const tokens: Token[] = [
      tok("お", "感動詞", 0),
      tok("、", "記号", 1),
      tok("すごい", "形容詞", 2),
    ];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("should NOT flag おもしろい (single token)", () => {
    const text = "おもしろい";
    const tokens: Token[] = [tok("おもしろい", "形容詞", 0)];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("should return no issues when disabled", () => {
    const text = "本お読む";
    const tokens: Token[] = [tok("本", "名詞", 0), tok("お", "助詞", 1), tok("読む", "動詞", 2)];
    const issues = rule.lintWithTokens(text, tokens, { enabled: false, severity: "error" });
    expect(issues).toHaveLength(0);
  });

  it("should return no issues via lint() (L2 requires tokens)", () => {
    const issues = rule.lint("本お読む", DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// gk-2-2-particle-ha
// ---------------------------------------------------------------------------
describe("gk-2-2-particle-ha (L2)", () => {
  const rule = findRule("gk-2-2-particle-ha");

  it("should flag こんにちわ", () => {
    const text = "こんにちわ";
    const tokens: Token[] = [tok("こんにちわ", "感動詞", 0)];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(1);
    expect(issues[0].from).toBe(4);
    expect(issues[0].fix?.replacement).toBe("は");
  });

  it("should flag こんばんわ", () => {
    const text = "こんばんわ";
    const tokens: Token[] = [tok("こんばんわ", "感動詞", 0)];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(1);
    expect(issues[0].from).toBe(4);
  });

  it("should flag わ recognized as non-終助詞 particle", () => {
    // 「私わ学生です」 — kuromoji sees わ as 係助詞
    const text = "私わ学生です";
    const tokens: Token[] = [
      tok("私", "名詞", 0),
      tok("わ", "助詞", 1, { pos_detail_1: "係助詞" }),
      tok("学生", "名詞", 2),
      tok("です", "助動詞", 4),
    ];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("は");
  });

  it("should NOT flag 終助詞 わ (嫌だわ)", () => {
    const text = "嫌だわ";
    const tokens: Token[] = [
      tok("嫌", "形容詞", 0),
      tok("だ", "助動詞", 1),
      tok("わ", "助詞", 2, { pos_detail_1: "終助詞" }),
    ];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("should NOT flag 終助詞 わ (行くわよ)", () => {
    const text = "行くわよ";
    const tokens: Token[] = [
      tok("行く", "動詞", 0),
      tok("わ", "助詞", 2, { pos_detail_1: "終助詞" }),
      tok("よ", "助詞", 3, { pos_detail_1: "終助詞" }),
    ];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("should flag standalone わ between content words (heuristic)", () => {
    // 「猫わ可愛い」 — kuromoji might not classify わ as a particle
    const text = "猫わ可愛い";
    const tokens: Token[] = [
      tok("猫", "名詞", 0),
      tok("わ", "記号", 1),
      tok("可愛い", "形容詞", 2),
    ];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// gk-2-3-particle-he
// ---------------------------------------------------------------------------
describe("gk-2-3-particle-he (L2)", () => {
  const rule = findRule("gk-2-3-particle-he");

  it("should flag え recognized as a particle by kuromoji", () => {
    const text = "東京え行く";
    const tokens: Token[] = [tok("東京", "名詞", 0), tok("え", "助詞", 2), tok("行く", "動詞", 3)];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("へ");
  });

  it("should NOT flag interjection え", () => {
    const text = "え？本当？";
    const tokens: Token[] = [
      tok("え", "感動詞", 0),
      tok("？", "記号", 1),
      tok("本当", "名詞", 2),
      tok("？", "記号", 4),
    ];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("should NOT flag え that is part of a word (答え)", () => {
    // kuromoji tokenizes 答え as a single token
    const text = "答え";
    const tokens: Token[] = [tok("答え", "名詞", 0)];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("should flag standalone え between noun and movement verb (heuristic)", () => {
    const text = "故郷え帰る";
    const tokens: Token[] = [
      tok("故郷", "名詞", 0),
      tok("え", "記号", 2), // kuromoji didn't classify as particle
      tok("帰る", "動詞", 3),
    ];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(1);
  });

  it("should NOT flag え between noun and non-verb", () => {
    const text = "答えきれい";
    const tokens: Token[] = [tok("答え", "名詞", 0), tok("きれい", "形容詞", 2)];
    const issues = rule.lintWithTokens(text, tokens, DEFAULT_CONFIG);
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule metadata
// ---------------------------------------------------------------------------
describe("gendai-kanazukai L2 rules metadata", () => {
  const rules = createGendaiKanazukaiL2Rules();

  it("should create 3 rules", () => {
    expect(rules).toHaveLength(3);
  });

  it("should have correct rule IDs", () => {
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("gk-2-1-particle-o");
    expect(ids).toContain("gk-2-2-particle-ha");
    expect(ids).toContain("gk-2-3-particle-he");
  });

  it("should be L2 level with morphological engine", () => {
    for (const rule of rules) {
      expect(rule.level).toBe("L2");
      expect(rule.engine).toBe("morphological");
    }
  });
});
