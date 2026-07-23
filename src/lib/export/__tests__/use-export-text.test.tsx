import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExport } from "../use-export";
import type { TxtIndentOptions } from "../txt-export-types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const notifications = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  showProgress: vi.fn(() => "progress-id"),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: notifications,
}));

type ExportApi = ReturnType<typeof useExport>;
let root: Root;
let container: HTMLDivElement;
let api: ExportApi | undefined;
const exportMdiText = vi.fn();
const exportHTML = vi.fn();
const copyMdiText = vi.fn();
const indent: TxtIndentOptions = { fullwidthSpaceIndent: true, indentCount: 2 };
const requestTxtExportOptions = vi.fn(async () => indent as TxtIndentOptions | null);

function Harness(): null {
  const value = useExport({
    getContent: () => "本文。",
    getTitle: () => "作品.mdi",
    getFileType: () => ".mdi",
    getIsEditorTabActive: () => true,
    onRequestTxtExportOptions: requestTxtExportOptions,
  });
  useEffect(() => {
    api = value;
  }, [value]);
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  api = undefined;
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: { exportHTML, exportMdiText, copyMdiText },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useExport native text export", () => {
  it("forwards source metadata and indent settings to the native IPC", async () => {
    exportMdiText.mockResolvedValue("/tmp/作品_narou.txt");

    await act(async () => api?.exportAs("narou"));

    expect(exportMdiText).toHaveBeenCalledWith("本文。", "narou", ".mdi", indent, "作品.mdi");
    expect(notifications.dismiss).toHaveBeenCalledWith("progress-id");
    expect(notifications.success).toHaveBeenCalledWith("小説家になろう形式をエクスポートしました");
  });

  it("does not report success when the native save dialog is cancelled", async () => {
    exportMdiText.mockResolvedValue(null);

    await act(async () => api?.exportAs("txt"));

    expect(notifications.dismiss).toHaveBeenCalledWith("progress-id");
    expect(notifications.success).not.toHaveBeenCalled();
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it("reports a structured main-process export failure", async () => {
    exportMdiText.mockResolvedValue({ success: false, error: "書き込みに失敗しました" });

    await act(async () => api?.exportAs("aozora"));

    expect(notifications.error).toHaveBeenCalledWith(
      "青空文庫形式のエクスポートに失敗しました: 書き込みに失敗しました",
    );
    expect(notifications.success).not.toHaveBeenCalled();
  });
});

describe("useExport native HTML export", () => {
  it("forwards live source, file type, and title to the main process", async () => {
    exportHTML.mockResolvedValue("/tmp/作品.html");

    await act(async () => api?.exportAs("html"));

    expect(exportHTML).toHaveBeenCalledWith("本文。", ".mdi", "作品.mdi");
    expect(requestTxtExportOptions).not.toHaveBeenCalled();
    expect(notifications.dismiss).toHaveBeenCalledWith("progress-id");
    expect(notifications.success).toHaveBeenCalledWith("HTMLをエクスポートしました");
  });

  it("reports a structured HTML export failure", async () => {
    exportHTML.mockResolvedValue({ success: false, error: "HTML生成に失敗しました" });

    await act(async () => api?.exportAs("html"));

    expect(notifications.error).toHaveBeenCalledWith(
      "HTMLのエクスポートに失敗しました: HTML生成に失敗しました",
    );
    expect(notifications.success).not.toHaveBeenCalled();
  });
});

describe("useExport native text clipboard copy", () => {
  it.each([
    ["txt", "テキスト（プレーン）"],
    ["txt-ruby", "テキスト（ルビ付き）"],
    ["narou", "小説家になろう形式"],
    ["kakuyomu", "カクヨム形式"],
    ["aozora", "青空文庫形式"],
  ] as const)("copies %s through the native MDI IPC", async (format, label) => {
    copyMdiText.mockResolvedValue({ success: true });

    await act(async () => api?.copyAs(format));

    expect(requestTxtExportOptions).toHaveBeenCalledWith(format, "copy");
    expect(copyMdiText).toHaveBeenCalledWith("本文。", format, ".mdi", indent);
    expect(notifications.dismiss).toHaveBeenCalledWith("progress-id");
    expect(notifications.success).toHaveBeenCalledWith(`${label}をクリップボードにコピーしました`);
  });

  it("does not render or notify when the indentation dialog is cancelled", async () => {
    requestTxtExportOptions.mockResolvedValueOnce(null);

    await act(async () => api?.copyAs("narou"));

    expect(copyMdiText).not.toHaveBeenCalled();
    expect(notifications.showProgress).not.toHaveBeenCalled();
    expect(notifications.success).not.toHaveBeenCalled();
  });

  it("reports a structured clipboard failure", async () => {
    copyMdiText.mockResolvedValue({ success: false, error: "クリップボードを利用できません" });

    await act(async () => api?.copyAs("aozora"));

    expect(notifications.error).toHaveBeenCalledWith(
      "青空文庫形式のクリップボードへのコピーに失敗しました: クリップボードを利用できません",
    );
    expect(notifications.success).not.toHaveBeenCalled();
  });
});
