import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import AboutSection from "../AboutSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const updateSettingsMock = vi.fn();

vi.mock("@/contexts/EditorSettingsContext", () => ({
  useUpdateSettingsContext: () => updateSettingsMock(),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  updateSettingsMock.mockReset();
  updateSettingsMock.mockReturnValue({
    allowBetaUpdates: false,
    onAllowBetaUpdatesChange: vi.fn(),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe("AboutSection update channel UI", () => {
  it("shows the beta update toggle for direct desktop builds", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.3.0");
    (window as unknown as { electronAPI: { isElectron: boolean } }).electronAPI = {
      isElectron: true,
    };

    await act(async () => {
      root.render(<AboutSection />);
    });

    expect(container.textContent).toContain("ベータ版アップデートを受け取る");
    expect(container.textContent).not.toContain("配信プラットフォーム経由で更新されます");
    expect(container.querySelector("#allow-beta-updates")).not.toBeNull();
  });

  it("hides the direct beta toggle for Microsoft Store flight builds", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.3.0-beta.20260708.1");
    (
      window as unknown as {
        electronAPI: {
          isElectron: boolean;
          appRuntime: {
            distributionProvider: "microsoft-store";
            releaseChannel: "beta";
          };
        };
      }
    ).electronAPI = {
      isElectron: true,
      appRuntime: {
        distributionProvider: "microsoft-store",
        releaseChannel: "beta",
      },
    };

    await act(async () => {
      root.render(<AboutSection />);
    });

    expect(container.textContent).not.toContain("ベータ版アップデートを受け取る");
    expect(container.textContent).toContain("ベータ版（Flight）");
    expect(container.textContent).toContain("配信プラットフォーム経由で更新されます");
    expect(container.querySelector("#allow-beta-updates")).toBeNull();
  });

  it("shows store-managed copy for App Store builds", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.3.0");
    (
      window as unknown as {
        electronAPI: {
          isElectron: boolean;
          appRuntime: {
            distributionProvider: "app-store";
            releaseChannel: "stable";
          };
        };
      }
    ).electronAPI = {
      isElectron: true,
      appRuntime: {
        distributionProvider: "app-store",
        releaseChannel: "stable",
      },
    };

    await act(async () => {
      root.render(<AboutSection />);
    });

    expect(container.textContent).not.toContain("ベータ版アップデートを受け取る");
    expect(container.textContent).toContain("ストア版");
    expect(container.textContent).toContain("ベータ版は招待されたテスターにのみ配信されます");
  });
});
