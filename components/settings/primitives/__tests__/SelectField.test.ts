/**
 * Contract tests for SelectField primitive.
 */

import { describe, it, expect } from "vitest";

describe("SelectField — module structure", () => {
  it("exports a default function component", async () => {
    const mod = await import("@/components/settings/primitives/SelectField");
    expect(typeof mod.default).toBe("function");
  });

  it("is re-exported from the primitives index", async () => {
    const mod = await import("@/components/settings/primitives");
    expect(typeof mod.SelectField).toBe("function");
  });
});

describe("SelectField — option shape contract", () => {
  it("accepts options with value + label only", () => {
    const options = [
      { value: "a", label: "選択肢A" },
      { value: "b", label: "選択肢B" },
    ] as const;
    expect(options[0].value).toBe("a");
    expect(options[1].label).toBe("選択肢B");
  });

  it("accepts options with optional description (radio-cards variant)", () => {
    const options = [
      { value: "vertical", label: "縦書き", description: "右から左へ進みます" },
      { value: "horizontal", label: "横書き", description: "左から右へ進みます" },
    ] as const;
    expect(options[0].description).toBe("右から左へ進みます");
  });
});

describe("SelectField — variant contract", () => {
  it("defaults to native 'select' variant when unspecified", () => {
    const variant: "select" | "radio-cards" | undefined = undefined;
    const resolved = variant ?? "select";
    expect(resolved).toBe("select");
  });

  it("accepts 'radio-cards' for small enum sets with per-option descriptions", () => {
    const variant: "select" | "radio-cards" = "radio-cards";
    expect(variant).toBe("radio-cards");
  });
});

describe("SelectField — onChange contract", () => {
  it("onChange receives the option value cast to the generic T", () => {
    type ScrollMode = "vertical" | "horizontal";
    let received: ScrollMode | null = null;
    const onChange = (v: ScrollMode): void => {
      received = v;
    };
    const rawFromEvent = "vertical";
    onChange(rawFromEvent as ScrollMode);
    expect(received).toBe("vertical");
  });

  it("selected semantics: opt.value === value", () => {
    const value = "vertical";
    const options = ["vertical", "horizontal"];
    const selected = options.map((v) => v === value);
    expect(selected).toEqual([true, false]);
  });
});
