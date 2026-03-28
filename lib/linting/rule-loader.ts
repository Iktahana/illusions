/**
 * Rule loader for Japanese style rules from rules.json.
 *
 * Provides typed accessors for filtering rules by level, book,
 * and implementation status.
 */

import rulesData from "./data/rules.json";

// --- Type definitions ---

export interface JsonBookEntry {
  Book: {
    Title: string;
    Author: string;
    Year: string;
    ISBN?: string;
  };
  Rules: JsonRuleEntry[];
}

export interface JsonRuleEntry {
  Rule_ID: string;
  Level: "L1" | "L2" | "L3";
  Description: string;
  "Pattern/Logic": string;
  Positive_Example: string;
  Negative_Example: string;
  Source_Reference: string;
  prompt?: string;
}

// Cast imported JSON to typed array
const books = rulesData as unknown as JsonBookEntry[];

// --- Public API ---

/** Flatten all rules from all books into a single array. */
export function getAllJsonRules(): JsonRuleEntry[] {
  return books.flatMap((book) => book.Rules);
}

/** Filter rules by level (L1, L2, or L3). */
export function getJsonRulesByLevel(
  level: "L1" | "L2" | "L3",
): JsonRuleEntry[] {
  return getAllJsonRules().filter((rule) => rule.Level === level);
}

/** Return L1 rules whose Pattern/Logic does NOT start with "TODO". */
export function getImplementableL1Rules(): JsonRuleEntry[] {
  return getJsonRulesByLevel("L1").filter(
    (rule) => !rule["Pattern/Logic"].startsWith("TODO"),
  );
}

/** Return L1 rules whose Pattern/Logic starts with "TODO". */
export function getTodoL1Rules(): JsonRuleEntry[] {
  return getJsonRulesByLevel("L1").filter((rule) =>
    rule["Pattern/Logic"].startsWith("TODO"),
  );
}

/** Filter rules by book title. */
export function getJsonRulesByBook(bookTitle: string): JsonRuleEntry[] {
  const book = books.find((b) => b.Book.Title === bookTitle);
  return book ? book.Rules : [];
}

/** Return all unique book titles. */
export function getBookTitles(): string[] {
  return books.map((book) => book.Book.Title);
}
