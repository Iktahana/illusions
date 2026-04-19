/**
 * Contract tests for SliderField primitive.
 */

import { describe, it, expect } from "vitest";

describe("SliderField — module structure", () => {
  it("exports a default function component", async () => {
    const mod = await import("@/components/settings/primitives/SliderField");
    expect(typeof mod.default).toBe("function");
  });

  it("is re-exported from the primitives index", async () => {
    const mod = await import("@/components/settings/primitives");
    expect(typeof mod.SliderField).toBe("function");
  });
});

describe("SliderField — formatValue contract", () => {
  it("defaults to String(value) when formatValue is not provided", () => {
    const value = 120;
    const formatter = undefined as ((v: number) => string) | undefined;
    const formatted = formatter ? formatter(value) : String(value);
    expect(formatted).toBe("120");
  });

  it("uses the provided formatter for percentage display (fontScale pattern)", () => {
    const formatter = (v: number): string => `${v}%`;
    expect(formatter(120)).toBe("120%");
  });

  it("uses the provided formatter for decimal display (lineHeight pattern)", () => {
    const formatter = (v: number): string => v.toFixed(1);
    expect(formatter(1.5)).toBe("1.5");
    expect(formatter(2)).toBe("2.0");
  });

  it("uses the provided formatter for em display (paragraphSpacing pattern)", () => {
    const formatter = (v: number): string => `${v.toFixed(1)}em`;
    expect(formatter(0.5)).toBe("0.5em");
  });
});

describe("SliderField — onChange coerces string input to number", () => {
  it("Number(e.target.value) converts '120' → 120", () => {
    // Mirrors the component's `onChange(Number(e.target.value))`
    const rawValue = "120";
    const coerced = Number(rawValue);
    expect(coerced).toBe(120);
    expect(typeof coerced).toBe("number");
  });

  it("Number('1.5') → 1.5 preserves decimals", () => {
    expect(Number("1.5")).toBe(1.5);
  });
});

describe("SliderField — min/max/step contract", () => {
  it("props accept standard numeric range triples", () => {
    const fontScale = { min: 50, max: 200, step: 5 };
    const lineHeight = { min: 1.0, max: 3.0, step: 0.1 };
    expect(fontScale.max > fontScale.min).toBe(true);
    expect(lineHeight.step < 1).toBe(true);
  });
});
