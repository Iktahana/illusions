import { describe, it, expect } from "vitest";

import {
  getAllJsonRules,
  getJsonRulesByLevel,
  getImplementableL1Rules,
  getTodoL1Rules,
  getJsonRulesByBook,
  getBookTitles,
} from "../rule-loader";

describe("rule-loader", () => {
  // -----------------------------------------------------------------------
  // getAllJsonRules
  // -----------------------------------------------------------------------
  describe("getAllJsonRules", () => {
    it("should return all rules from all books", () => {
      const rules = getAllJsonRules();
      // 6 books with a total of 121 rules
      expect(rules.length).toBe(121);
    });

    it("should return rules with valid structure", () => {
      const rules = getAllJsonRules();
      for (const rule of rules) {
        expect(rule.Rule_ID).toBeDefined();
        expect(typeof rule.Rule_ID).toBe("string");
        expect(rule.Level).toMatch(/^L[123]$/);
        expect(rule.Description).toBeDefined();
        expect(rule["Pattern/Logic"]).toBeDefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // getJsonRulesByLevel
  // -----------------------------------------------------------------------
  describe("getJsonRulesByLevel", () => {
    it("should return only L1 rules", () => {
      const l1Rules = getJsonRulesByLevel("L1");
      expect(l1Rules.length).toBe(58);
      expect(l1Rules.every((r) => r.Level === "L1")).toBe(true);
    });

    it("should return only L2 rules", () => {
      const l2Rules = getJsonRulesByLevel("L2");
      expect(l2Rules.length).toBeGreaterThan(0);
      expect(l2Rules.every((r) => r.Level === "L2")).toBe(true);
    });

    it("should return only L3 rules", () => {
      const l3Rules = getJsonRulesByLevel("L3");
      expect(l3Rules.every((r) => r.Level === "L3")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getImplementableL1Rules
  // -----------------------------------------------------------------------
  describe("getImplementableL1Rules", () => {
    it("should return L1 rules without TODO patterns", () => {
      const rules = getImplementableL1Rules();
      expect(rules.length).toBe(35);
      for (const rule of rules) {
        expect(rule.Level).toBe("L1");
        expect(rule["Pattern/Logic"].startsWith("TODO")).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------
  // getTodoL1Rules
  // -----------------------------------------------------------------------
  describe("getTodoL1Rules", () => {
    it("should return L1 rules with TODO patterns", () => {
      const rules = getTodoL1Rules();
      expect(rules.length).toBe(23);
      for (const rule of rules) {
        expect(rule.Level).toBe("L1");
        expect(rule["Pattern/Logic"].startsWith("TODO")).toBe(true);
      }
    });

    it("should be disjoint from implementable rules", () => {
      const todo = getTodoL1Rules();
      const impl = getImplementableL1Rules();
      const todoIds = new Set(todo.map((r) => r.Rule_ID));
      const implIds = new Set(impl.map((r) => r.Rule_ID));

      for (const id of todoIds) {
        expect(implIds.has(id)).toBe(false);
      }

      // Together they should equal all L1 rules
      expect(todo.length + impl.length).toBe(getJsonRulesByLevel("L1").length);
    });
  });

  // -----------------------------------------------------------------------
  // getJsonRulesByBook
  // -----------------------------------------------------------------------
  describe("getJsonRulesByBook", () => {
    it("should return JTF rules by book title", () => {
      const rules = getJsonRulesByBook("JTF 日本語標準スタイルガイド");
      expect(rules.length).toBe(75);
    });

    it("should return manuscript rules by book title", () => {
      const rules = getJsonRulesByBook("原稿編集 第2版");
      expect(rules.length).toBe(20);
    });

    it("should return nihongo-hyouki rules by book title", () => {
      const rules = getJsonRulesByBook("日本語表記");
      expect(rules.length).toBe(19);
    });

    it("should return gendai-kanazukai rules by book title", () => {
      const rules = getJsonRulesByBook("現代仮名遣い");
      expect(rules.length).toBe(3);
    });

    it("should return empty array for unknown book", () => {
      const rules = getJsonRulesByBook("Nonexistent Book");
      expect(rules).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getBookTitles
  // -----------------------------------------------------------------------
  describe("getBookTitles", () => {
    it("should return all 6 book titles", () => {
      const titles = getBookTitles();
      expect(titles).toHaveLength(6);
    });

    it("should contain expected book titles", () => {
      const titles = getBookTitles();
      expect(titles).toContain("JTF 日本語標準スタイルガイド");
      expect(titles).toContain("原稿編集 第2版");
      expect(titles).toContain("日本語表記");
      expect(titles).toContain("現代仮名遣い");
      expect(titles).toContain("常用漢字表");
      expect(titles).toContain("公用文 送り仮名用例集");
    });
  });
});
