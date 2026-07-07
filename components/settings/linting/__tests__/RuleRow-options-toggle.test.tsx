/**
 * #2048 — per-rule 「動詞・形容詞も照合する」 sub-toggle.
 *
 * Rendered only for rules whose manifest declares a boolean
 * `includeVerbsAdjectives` in defaultConfig.options (genji-out-of-dict).
 * Toggling must emit a config whose `options.includeVerbsAdjectives` flips,
 * without touching other option keys.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import RuleRow, { type RuleConfig } from "../RuleRow";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABEL = "動詞・形容詞も照合する";

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

function renderRow(props: Partial<React.ComponentProps<typeof RuleRow>> = {}): void {
  const base: React.ComponentProps<typeof RuleRow> = {
    ruleId: "genji-out-of-dict",
    nameJa: "未知語の検出",
    config: { enabled: true, severity: "info" },
    onChange: () => {},
    ...props,
  };
  act(() => {
    root.render(<RuleRow {...base} />);
  });
}

function findOptionSwitch(): HTMLButtonElement {
  // Innermost div containing the label = the sub-toggle row (the root row div
  // also contains the label text, so take the LAST match in document order).
  const row = [...container.querySelectorAll("div")]
    .filter((d) => d.textContent?.includes(LABEL))
    .at(-1);
  const button = row?.querySelector<HTMLButtonElement>('button[role="switch"]');
  if (!button) throw new Error("option toggle not found");
  return button;
}

describe("RuleRow — includeVerbsAdjectives sub-toggle (#2048)", () => {
  it("is hidden for rules that do not declare the option", () => {
    renderRow({ includeVerbsAdjectivesDefault: undefined });
    expect(container.textContent).not.toContain(LABEL);
  });

  it("renders for rules declaring the option, defaulting to the manifest value", () => {
    renderRow({ includeVerbsAdjectivesDefault: false });
    const toggle = findOptionSwitch();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("reflects the user override over the manifest default", () => {
    renderRow({
      includeVerbsAdjectivesDefault: false,
      config: {
        enabled: true,
        severity: "info",
        options: { includeVerbsAdjectives: true },
      },
    });
    expect(findOptionSwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("clicking emits a config with the flipped option, preserving other keys", () => {
    const onChange = vi.fn<(ruleId: string, config: RuleConfig) => void>();
    renderRow({
      includeVerbsAdjectivesDefault: false,
      config: {
        enabled: true,
        severity: "info",
        skipDialogue: true,
        options: { minLength: 2 },
      },
      onChange,
    });

    act(() => {
      findOptionSwitch().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [ruleId, config] = onChange.mock.calls[0];
    expect(ruleId).toBe("genji-out-of-dict");
    expect(config).toEqual({
      enabled: true,
      severity: "info",
      skipDialogue: true,
      options: { minLength: 2, includeVerbsAdjectives: true },
    });
  });

  it("clicking again turns the override off (explicit false, not deletion)", () => {
    const onChange = vi.fn<(ruleId: string, config: RuleConfig) => void>();
    renderRow({
      includeVerbsAdjectivesDefault: false,
      config: {
        enabled: true,
        severity: "info",
        options: { includeVerbsAdjectives: true },
      },
      onChange,
    });

    act(() => {
      findOptionSwitch().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const [, config] = onChange.mock.calls[0];
    expect(config.options).toEqual({ includeVerbsAdjectives: false });
  });
});
