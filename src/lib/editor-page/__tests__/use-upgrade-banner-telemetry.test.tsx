import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StandaloneMode } from "@/lib/project/project-types";

const { trackUsageEvent } = vi.hoisted(() => ({ trackUsageEvent: vi.fn() }));
vi.mock("@/lib/analytics/usage-events", () => ({ trackUsageEvent }));

import { useUpgradeBanner } from "../use-upgrade-banner";

const mode = {
  type: "standalone",
  fileName: "private-name.mdi",
  fileExtension: ".mdi",
  fileHandle: null,
  editorSettings: {},
} as unknown as StandaloneMode;

const latest: { current: ReturnType<typeof useUpgradeBanner> | null } = { current: null };

function Harness({ content, savedAt }: { content: string; savedAt: number | null }): null {
  // eslint-disable-next-line react-hooks/immutability -- test harness publishes hook actions
  latest.current = useUpgradeBanner(mode, content, savedAt);
  return null;
}

describe("project upgrade funnel telemetry", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    trackUsageEvent.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("counts the first save after mount and reports dismiss once", async () => {
    await act(async () => root.render(<Harness content="" savedAt={null} />));
    await act(async () => root.render(<Harness content="" savedAt={1} />));

    expect(trackUsageEvent).toHaveBeenCalledWith("project_upgrade_prompt_shown", {
      trigger: "first_save",
    });
    act(() => latest.current?.handleUpgradeDismiss());
    expect(trackUsageEvent).toHaveBeenCalledWith("project_upgrade_cancelled", {
      trigger: "first_save",
    });
  });

  it("emits one prompt when content crosses the character threshold", async () => {
    await act(async () => root.render(<Harness content={"字".repeat(5_000)} savedAt={null} />));
    await act(async () => root.render(<Harness content={"字".repeat(5_100)} savedAt={null} />));

    expect(trackUsageEvent).toHaveBeenCalledTimes(1);
    expect(trackUsageEvent).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ content: expect.anything() }),
    );
  });
});
