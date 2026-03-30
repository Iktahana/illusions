import type { LintRule } from "@/lib/linting/types";

// ---------------------------------------------------------------------------
// L1 JSON-driven factory rules from Japanese-Style-Sheet
// ---------------------------------------------------------------------------
import { createJtfL1Rules } from "@/lib/linting/rules/json-l1/jtf-l1-rules";
import { createManuscriptL1Rules } from "@/lib/linting/rules/json-l1/manuscript-l1-rules";
import { createGendaiKanazukaiL1Rules, createNihongoHyoukiL1Rules } from "@/lib/linting/rules/json-l1";

/** Return all hand-written rules (currently none — all moved to JSON-driven). */
export function getAllRules(): LintRule[] {
  return [];
}

/** Return all JSON-driven L1 rules from the style-sheet factories. */
export function createJsonDrivenRules(): LintRule[] {
  return [
    ...createJtfL1Rules(),
    ...createManuscriptL1Rules(),
    ...createGendaiKanazukaiL1Rules(),
    ...createNihongoHyoukiL1Rules(),
  ];
}
