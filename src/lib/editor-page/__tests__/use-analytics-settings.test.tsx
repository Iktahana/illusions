import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { useAnalyticsSettings } from "../use-analytics-settings";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const persistAppState = vi.fn((_updates: unknown) => Promise.resolve({}));

vi.mock("@/lib/storage/app-state-manager", () => ({
  persistAppState: (updates: unknown) => persistAppState(updates),
}));

interface HookValue {
  analyticsSettings: ReturnType<typeof useAnalyticsSettings>["analyticsSettings"];
  analyticsHandlers: ReturnType<typeof useAnalyticsSettings>["analyticsHandlers"];
  applyPersistedAnalyticsSettings: ReturnType<
    typeof useAnalyticsSettings
  >["applyPersistedAnalyticsSettings"];
}

let latestValue: HookValue | null = null;

function HookHost({ onValue }: { onValue: (value: HookValue) => void }): null {
  const value = useAnalyticsSettings();

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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useAnalyticsSettings", () => {
  it("hydrates both usage analytics and error reporting consent from app state", async () => {
    await act(async () => {
      root.render(<HookHost onValue={(value) => (latestValue = value)} />);
    });

    expect(latestValue?.analyticsSettings.usageAnalyticsConsent).toBe(true);
    expect(latestValue?.analyticsSettings.errorReportingConsent).toBe(true);

    await act(async () => {
      latestValue?.applyPersistedAnalyticsSettings({
        usageAnalyticsConsent: false,
        errorReportingConsent: false,
      });
    });

    expect(latestValue?.analyticsSettings.usageAnalyticsConsent).toBe(false);
    expect(latestValue?.analyticsSettings.errorReportingConsent).toBe(false);
  });

  it("persists error reporting consent changes with prompted timestamp", async () => {
    await act(async () => {
      root.render(<HookHost onValue={(value) => (latestValue = value)} />);
    });

    await act(async () => {
      latestValue?.analyticsHandlers.handleErrorReportingConsentChange(false);
    });

    expect(persistAppState).toHaveBeenCalledTimes(1);
    expect(persistAppState).toHaveBeenCalledWith(
      expect.objectContaining({
        errorReportingConsent: false,
        errorReportingConsentPromptedAt: expect.any(String),
      }),
    );
  });
});
