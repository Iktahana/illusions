import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import PrivacySettingsTab from "../PrivacySettingsTab";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const analyticsSettingsMock = vi.fn();

vi.mock("@/contexts/EditorSettingsContext", () => ({
  useAnalyticsSettings: () => analyticsSettingsMock(),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  analyticsSettingsMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PrivacySettingsTab", () => {
  it("renders usage analytics and error reporting toggles with privacy copy", async () => {
    analyticsSettingsMock.mockReturnValue({
      usageAnalyticsConsent: true,
      errorReportingConsent: true,
      onUsageAnalyticsConsentChange: vi.fn(),
      onErrorReportingConsentChange: vi.fn(),
    });

    await act(async () => {
      root.render(<PrivacySettingsTab />);
    });

    expect(container.textContent).toContain("匿名の使用統計を送信する");
    expect(container.textContent).toContain("エラーレポートを送信する");
    expect(container.textContent).toContain("原稿本文・ファイル名・ファイルパス");
    expect(container.textContent).toContain("エクスポート・クリップボード出力の形式");

    const switches = container.querySelectorAll('[role="switch"]');
    expect(switches).toHaveLength(2);
  });

  it("forwards error reporting toggle changes", async () => {
    const onErrorReportingConsentChange = vi.fn();
    analyticsSettingsMock.mockReturnValue({
      usageAnalyticsConsent: true,
      errorReportingConsent: true,
      onUsageAnalyticsConsentChange: vi.fn(),
      onErrorReportingConsentChange,
    });

    await act(async () => {
      root.render(<PrivacySettingsTab />);
    });

    const errorToggle = container.querySelector(
      "#error-reporting-consent",
    ) as HTMLButtonElement | null;
    expect(errorToggle).not.toBeNull();

    await act(async () => {
      errorToggle?.click();
    });

    expect(onErrorReportingConsentChange).toHaveBeenCalledWith(false);
  });
});
