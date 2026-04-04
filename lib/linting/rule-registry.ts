import type { LintRule } from "@/lib/linting/types";

// ---------------------------------------------------------------------------
// L1 JSON-driven factory rules from Japanese-Style-Sheet
// ---------------------------------------------------------------------------
import { createJtfL1Rules } from "@/lib/linting/rules/json-l1/jtf-l1-rules";
import { createManuscriptL1Rules } from "@/lib/linting/rules/json-l1/manuscript-l1-rules";
import { createNihongoHyoukiL1Rules } from "@/lib/linting/rules/json-l1";

// ---------------------------------------------------------------------------
// L2 morphological rules (particle detection via kuromoji)
// ---------------------------------------------------------------------------
import { createGendaiKanazukaiL2Rules } from "@/lib/linting/rules/l2";

/** Return all hand-written rules (currently none — all moved to JSON-driven). */
export function getAllRules(): LintRule[] {
  return [];
}

/** Return all JSON-driven L1 rules from the style-sheet factories. */
export function createJsonDrivenRules(): LintRule[] {
  return [...createJtfL1Rules(), ...createManuscriptL1Rules(), ...createNihongoHyoukiL1Rules()];
}

/** Return all L2 morphological rules. */
export function createMorphologicalRules(): LintRule[] {
  return [...createGendaiKanazukaiL2Rules()];
}
