import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import ExportSettingsTab from "../ExportSettingsTab";
import { localPreferences } from "@/lib/storage/local-preferences";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ExportSettingsTab", () => {
  it("explains that automatic mode follows memory and does not affect export", async () => {
    await act(async () => root.render(<ExportSettingsTab />));

    expect(container.textContent).toContain("PDFプレビュー");
    expect(container.textContent).toContain("自動（推奨）");
    expect(container.textContent).toContain("搭載メモリに合わせて");
    expect(container.textContent).toContain("PDFファイルへの書き出しには影響しません");
  });

  it("persists a manually selected maximum page count", async () => {
    await act(async () => root.render(<ExportSettingsTab />));
    const select = container.querySelector("select") as HTMLSelectElement;

    await act(async () => {
      select.value = "500";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(localPreferences.getPdfPreviewMaxPages()).toBe("500");
    expect(select.value).toBe("500");
  });
});
