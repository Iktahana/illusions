import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_EXPORT_SETTINGS } from "@/lib/export/export-settings";

vi.mock("@/shared/ui/GlassDialog", () => ({
  default: ({ ariaLabel, children }: { ariaLabel: string; children: React.ReactNode }) => (
    <div aria-label={ariaLabel}>{children}</div>
  ),
}));

const settingsMocks = vi.hoisted(() => ({
  loadExportSettings: vi.fn(),
  saveExportSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/export/export-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/export/export-settings")>();
  return {
    ...actual,
    loadExportSettings: settingsMocks.loadExportSettings,
    saveExportSettings: settingsMocks.saveExportSettings,
  };
});

const { default: TxtExportDialog } = await import("../TxtExportDialog");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  settingsMocks.loadExportSettings.mockResolvedValue(DEFAULT_EXPORT_SETTINGS);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TxtExportDialog operation labels", () => {
  it("uses natural clipboard wording for a copy operation", async () => {
    await act(async () => {
      root.render(
        <TxtExportDialog
          isOpen
          format="narou"
          operation="copy"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
    });

    expect(container.querySelector('[aria-label="テキスト出力設定"]')).not.toBeNull();
    expect(container.textContent).toContain("小説家になろう形式");
    expect(container.textContent).toContain("クリップボードにコピー");
    expect(container.textContent).not.toContain("小説家になろう形式エクスポート");
  });

  it("keeps the export action wording for file output", async () => {
    await act(async () => {
      root.render(
        <TxtExportDialog
          isOpen
          format="txt-ruby"
          operation="export"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
    });

    const buttonLabels = Array.from(container.querySelectorAll("button"), (button) =>
      button.textContent?.trim(),
    );
    expect(buttonLabels).toContain("エクスポート");
  });

  it("labels the note output profile", async () => {
    await act(async () => {
      root.render(
        <TxtExportDialog isOpen format="note" onConfirm={() => {}} onCancel={() => {}} />,
      );
    });

    expect(container.textContent).toContain("note形式");
  });

  it("asks before discarding changed settings", async () => {
    const onCancel = vi.fn();
    await act(async () => {
      root.render(<TxtExportDialog isOpen format="txt" onConfirm={() => {}} onCancel={onCancel} />);
    });

    const toggle = container.querySelector('[role="switch"]') as HTMLButtonElement;
    await act(async () => toggle.click());
    const cancel = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "キャンセル",
    ) as HTMLButtonElement;
    await act(async () => cancel.click());

    expect(container.textContent).toContain("エクスポートをキャンセルしますか？");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("uses the native confirmation hook in a system export window", async () => {
    const onCancel = vi.fn();
    const confirmDiscard = vi.fn().mockResolvedValue(true);
    await act(async () => {
      root.render(
        <TxtExportDialog
          isOpen
          presentation="window"
          format="txt"
          confirmDiscard={confirmDiscard}
          onConfirm={() => {}}
          onCancel={onCancel}
        />,
      );
    });

    const toggle = container.querySelector('[role="switch"]') as HTMLButtonElement;
    await act(async () => toggle.click());
    const cancel = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "キャンセル",
    ) as HTMLButtonElement;
    await act(async () => cancel.click());

    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("エクスポートをキャンセルしますか？");
  });
});
