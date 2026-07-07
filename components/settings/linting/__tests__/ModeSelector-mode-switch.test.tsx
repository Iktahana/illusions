/**
 * Integration regression test for the #1809/#1810 mode-switch wiring.
 *
 * After built-in rules were zeroed out, `ModeSelector` fed
 * `LINT_PRESETS[presetId].configs` (now always `{}`) to the batch handler, so
 * clicking a mode pill emitted an empty map — no rule was ever enabled or
 * disabled, and the manual config got clobbered with `{}`.
 *
 * The fix derives the config from each loaded rule's `applicableModes`. This
 * test renders the real component with representative runtime rule metadata and
 * asserts the emitted batch map actually toggles rules per the selected mode.
 * With the old code this assertion fails (the map would be empty).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import ModeSelector from "../ModeSelector";
import type { ModeRuleMetaInput } from "@/lib/linting/mode-rule-configs";
import type { CorrectionConfig } from "@/lib/linting/correction-config";
import type { Severity } from "@/lib/linting/types";

const LOADED_RULES: ModeRuleMetaInput[] = [
  {
    ruleId: "me2-17-repetition-symbols",
    applicableModes: ["novel"],
    defaultConfig: { enabled: true, severity: "info" },
  },
  {
    ruleId: "jtf-1-2-1",
    applicableModes: ["official", "academic"],
    defaultConfig: { enabled: true, severity: "error" },
  },
];

const BASE_CONFIG: CorrectionConfig = {
  enabled: true,
  mode: "novel",
  guidelines: [],
  ruleOverrides: {},
  ignoredCorrections: [],
};

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function clickModeButton(label: string): void {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`mode button "${label}" not found`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("ModeSelector — mode switch actually toggles rules (regression #1809/#1810)", () => {
  it("emits a non-empty config map that enables the selected mode's rules", () => {
    const onBatch =
      vi.fn<(configs: Record<string, { enabled: boolean; severity: Severity }>) => void>();

    act(() => {
      root.render(
        <ModeSelector
          correctionConfig={BASE_CONFIG}
          loadedRules={LOADED_RULES}
          lintingRuleConfigs={{}}
          onCorrectionConfigChange={() => {}}
          onLintingRuleConfigsBatchChange={onBatch}
        />,
      );
    });

    // Switch to 公用文 (official): jtf-1-2-1 should turn on, novel-only rule off.
    clickModeButton("公用文");

    expect(onBatch).toHaveBeenCalledTimes(1);
    const configs = onBatch.mock.calls[0][0];

    // The whole point of the regression: the map must NOT be empty.
    expect(Object.keys(configs).length).toBeGreaterThan(0);
    expect(configs["jtf-1-2-1"]).toEqual({ enabled: true, severity: "error" });
    expect(configs["me2-17-repetition-symbols"].enabled).toBe(false);
  });

  it("selecting 小説 (novel) enables the novel-only rule and disables the others", () => {
    const onBatch =
      vi.fn<(configs: Record<string, { enabled: boolean; severity: Severity }>) => void>();

    act(() => {
      root.render(
        <ModeSelector
          correctionConfig={{ ...BASE_CONFIG, mode: "official" }}
          loadedRules={LOADED_RULES}
          lintingRuleConfigs={{}}
          onCorrectionConfigChange={() => {}}
          onLintingRuleConfigsBatchChange={onBatch}
        />,
      );
    });

    clickModeButton("小説");

    const configs = onBatch.mock.calls[0][0];
    expect(configs["me2-17-repetition-symbols"].enabled).toBe(true);
    expect(configs["jtf-1-2-1"].enabled).toBe(false);
  });

  it("carries user rule-option overrides through a mode switch (#2048)", () => {
    const onBatch =
      vi.fn<
        (
          configs: Record<
            string,
            { enabled: boolean; severity: Severity; options?: Record<string, unknown> }
          >,
        ) => void
      >();

    const rules: ModeRuleMetaInput[] = [
      ...LOADED_RULES,
      {
        ruleId: "genji-out-of-dict",
        applicableModes: ["novel"],
        defaultConfig: {
          enabled: true,
          severity: "info",
          options: { includeVerbsAdjectives: false },
        },
      },
    ];

    act(() => {
      root.render(
        <ModeSelector
          correctionConfig={{ ...BASE_CONFIG, mode: "official" }}
          loadedRules={rules}
          lintingRuleConfigs={{
            "genji-out-of-dict": {
              enabled: true,
              severity: "info",
              options: { includeVerbsAdjectives: true },
            },
          }}
          onCorrectionConfigChange={() => {}}
          onLintingRuleConfigsBatchChange={onBatch}
        />,
      );
    });

    clickModeButton("小説");

    const configs = onBatch.mock.calls[0][0];
    // The whole-map replace must NOT drop the user's option override.
    expect(configs["genji-out-of-dict"].options).toEqual({ includeVerbsAdjectives: true });
    expect(configs["genji-out-of-dict"].enabled).toBe(true);
  });
});
