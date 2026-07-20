import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { useErrorReportingConsentToast } from "../use-error-reporting-consent-toast";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchAppState = vi.fn();
const persistAppState = vi.fn();
const showMessage = vi.fn();

vi.mock("@/lib/storage/app-state-manager", () => ({
  fetchAppState: () => fetchAppState(),
  persistAppState: (updates: unknown) => persistAppState(updates),
}));

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: {
    showMessage: (...args: unknown[]) => showMessage(...args),
  },
}));

function HookHost({ openPrivacySettings }: { openPrivacySettings: () => void }): null {
  useErrorReportingConsentToast({ openPrivacySettings });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  fetchAppState.mockReset();
  persistAppState.mockReset();
  showMessage.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI = {
    isElectron: true,
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI;
});

describe("useErrorReportingConsentToast", () => {
  it("shows a persistent consent toast once when not prompted yet", async () => {
    fetchAppState.mockResolvedValue({});

    await act(async () => {
      root.render(<HookHost openPrivacySettings={vi.fn()} />);
    });

    expect(showMessage).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenCalledWith(
      expect.stringContaining("原稿本文・ファイル名・ファイルパスは送信されません"),
      expect.objectContaining({ duration: 0, type: "info" }),
    );
  });

  it("does not show a toast on web or after prompt timestamp exists", async () => {
    fetchAppState.mockResolvedValue({
      errorReportingConsentPromptedAt: "2026-07-02T00:00:00.000Z",
    });
    (window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI = {
      isElectron: false,
    };

    await act(async () => {
      root.render(<HookHost openPrivacySettings={vi.fn()} />);
    });

    expect(showMessage).not.toHaveBeenCalled();
  });

  it("wires OK and 設定 actions", async () => {
    fetchAppState.mockResolvedValue({});
    const openPrivacySettings = vi.fn();

    await act(async () => {
      root.render(<HookHost openPrivacySettings={openPrivacySettings} />);
    });

    const options = showMessage.mock.calls[0]?.[1] as
      { actions?: Array<{ label: string; onClick: () => void }> } | undefined;
    expect(options?.actions).toHaveLength(2);

    const okAction = options?.actions?.find((action) => action.label === "OK");
    const settingsAction = options?.actions?.find((action) => action.label === "設定");

    okAction?.onClick();
    settingsAction?.onClick();

    expect(persistAppState).toHaveBeenCalledWith(
      expect.objectContaining({
        errorReportingConsent: true,
        errorReportingConsentPromptedAt: expect.any(String),
      }),
    );
    expect(persistAppState).toHaveBeenCalledWith(
      expect.objectContaining({
        errorReportingConsentPromptedAt: expect.any(String),
      }),
    );
    expect(openPrivacySettings).toHaveBeenCalledOnce();
  });
});
