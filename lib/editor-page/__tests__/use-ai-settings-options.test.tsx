/**
 * #2048 — persistence round-trip for per-rule `options` overrides
 * (e.g. genji-out-of-dict's `includeVerbsAdjectives`).
 *
 * The settings UI writes `options` through `handleLintingRuleConfigChange`;
 * on the next launch `applyPersistedAiSettings` must read them back so the
 * override actually reaches the RuleRunner (via useLinting's setConfig sync).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { useAiSettings } from "../use-ai-settings";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const persistAppState = vi.fn((_updates: unknown) => Promise.resolve({}));
const fetchAppState = vi.fn(() => Promise.resolve(null));

vi.mock("@/lib/storage/app-state-manager", () => ({
  persistAppState: (updates: unknown) => persistAppState(updates),
  fetchAppState: () => fetchAppState(),
}));

vi.mock("@/lib/ai/ai-client", () => ({
  configureAiClient: vi.fn(),
  resetAiClient: vi.fn(),
}));

type HookValue = ReturnType<typeof useAiSettings>;

let latestValue: HookValue | null = null;

function HookHost({ onValue }: { onValue: (value: HookValue) => void }): null {
  const value = useAiSettings();

  useEffect(() => {
    onValue(value);
  }, [onValue, value]);

  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  latestValue = null;
  persistAppState.mockClear();
  fetchAppState.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderHook(): Promise<void> {
  await act(async () => {
    root.render(<HookHost onValue={(value) => (latestValue = value)} />);
  });
}

describe("useAiSettings — per-rule options round-trip (#2048)", () => {
  it("reads back persisted rule options (load path)", async () => {
    await renderHook();

    await act(async () => {
      latestValue!.applyPersistedAiSettings({
        lintingRuleConfigs: {
          "genji-out-of-dict": {
            enabled: true,
            severity: "info",
            options: { includeVerbsAdjectives: true },
          },
        },
      });
    });

    expect(latestValue!.aiSettings.lintingRuleConfigs["genji-out-of-dict"]).toEqual({
      enabled: true,
      severity: "info",
      options: { includeVerbsAdjectives: true },
    });
  });

  it("drops malformed options on load but keeps the rest of the entry", async () => {
    await renderHook();

    await act(async () => {
      latestValue!.applyPersistedAiSettings({
        lintingRuleConfigs: {
          "genji-out-of-dict": { enabled: true, severity: "info", options: "not-an-object" },
          "other-rule": { enabled: false, severity: "warning", options: [1, 2] },
        },
      });
    });

    expect(latestValue!.aiSettings.lintingRuleConfigs["genji-out-of-dict"]).toEqual({
      enabled: true,
      severity: "info",
    });
    expect(latestValue!.aiSettings.lintingRuleConfigs["other-rule"]).toEqual({
      enabled: false,
      severity: "warning",
    });
  });

  it("persists options through handleLintingRuleConfigChange (save path)", async () => {
    await renderHook();

    await act(async () => {
      latestValue!.aiHandlers.handleLintingRuleConfigChange("genji-out-of-dict", {
        enabled: true,
        severity: "info",
        options: { includeVerbsAdjectives: true },
      });
    });

    expect(latestValue!.aiSettings.lintingRuleConfigs["genji-out-of-dict"].options).toEqual({
      includeVerbsAdjectives: true,
    });
    expect(persistAppState).toHaveBeenCalledWith({
      lintingRuleConfigs: {
        "genji-out-of-dict": {
          enabled: true,
          severity: "info",
          options: { includeVerbsAdjectives: true },
        },
      },
    });
  });

  it("full round-trip: save → reload sees the same options", async () => {
    await renderHook();

    await act(async () => {
      latestValue!.aiHandlers.handleLintingRuleConfigChange("genji-out-of-dict", {
        enabled: true,
        severity: "info",
        options: { includeVerbsAdjectives: true },
      });
    });

    // What was handed to persistAppState is what the next launch loads.
    const persisted = persistAppState.mock.calls.at(-1)![0] as Record<string, unknown>;

    await act(async () => {
      latestValue!.applyPersistedAiSettings(persisted);
    });

    expect(latestValue!.aiSettings.lintingRuleConfigs["genji-out-of-dict"].options).toEqual({
      includeVerbsAdjectives: true,
    });
  });
});
