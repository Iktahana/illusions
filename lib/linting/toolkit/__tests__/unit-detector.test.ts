import { describe, it, expect } from "vitest";

import { detectUnits } from "../unit-detector";

const BASE = { ruleId: "unit-rule", severity: "warning" as const };

describe("detectUnits — Tier A duplicate removal", () => {
  it("collapses overlapping patterns to a single issue per span (2 KW)", () => {
    const issues = detectUnits({
      ...BASE,
      text: "2 KW",
      units: [
        { pattern: /(?<=\d\s*)kw\b/gi, correct: "kW" },
        { pattern: /(?<=\d\s*)KW\b/g, correct: "kW" },
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ from: 2, to: 4, originalText: "KW" });
    expect(issues[0].fix?.replacement).toBe("kW");
  });

  it("collapses duplicates for km/H as well", () => {
    const issues = detectUnits({
      ...BASE,
      text: "60 km/H",
      units: [
        { pattern: /(?<=\d\s*)km\/H\b/g, correct: "km/h" },
        { pattern: /(?<=\d\s*)KM\/H\b/gi, correct: "km/h" },
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("km/h");
  });

  it("can be told NOT to dedup", () => {
    const issues = detectUnits({
      ...BASE,
      dedup: false,
      text: "2 KW",
      units: [
        { pattern: /(?<=\d\s*)kw\b/gi, correct: "kW" },
        { pattern: /(?<=\d\s*)KW\b/g, correct: "kW" },
      ],
    });
    expect(issues).toHaveLength(2);
  });
});

describe("detectUnits — edges", () => {
  it("skips already-correct notations", () => {
    const issues = detectUnits({
      ...BASE,
      text: "2 kW",
      units: [{ pattern: /(?<=\d\s*)kW\b/g, correct: "kW" }],
    });
    expect(issues).toHaveLength(0);
  });

  it("does not flag a unit with no preceding digit", () => {
    const issues = detectUnits({
      ...BASE,
      text: "KW dropped",
      units: [{ pattern: /(?<=\d\s*)KW\b/g, correct: "kW" }],
    });
    expect(issues).toHaveLength(0);
  });

  it("flags multiple distinct occurrences", () => {
    const issues = detectUnits({
      ...BASE,
      text: "2 KW and 5 KW",
      units: [{ pattern: /(?<=\d\s*)KW\b/g, correct: "kW" }],
    });
    expect(issues).toHaveLength(2);
  });
});
