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
const trackEvent = vi.fn(async () => undefined);
const requestExportDialog = vi.fn();
const indent: TxtIndentOptions = { fullwidthSpaceIndent: true, indentCount: 2 };
const requestTxtExportOptions = vi.fn(async () => indent as TxtIndentOptions | null);

function Harness({ withDialog = false }: { withDialog?: boolean }): null {
  const value = useExport({
    getContent: () => "本文。",
    getTitle: () => "作品.mdi",
    getFileType: () => ".mdi",
    getIsEditorTabActive: () => true,
    onExportDialogRequest: withDialog ? requestExportDialog : undefined,
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
    value: { exportHTML, exportMdiText, copyMdiText, analytics: { trackEvent } },
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
    expect(trackEvent).toHaveBeenCalledWith("document_output_completed", {
      operation: "export",
      format: "narou",
    });
    expect(notifications.dismiss).toHaveBeenCalledWith("progress-id");
    expect(notifications.success).toHaveBeenCalledWith("小説家になろう形式をエクスポートしました");
  });

  it("tracks one successful note export with its dedicated event", async () => {
    exportMdiText.mockResolvedValue("/Users/alice/private/作品_note.txt");

    await act(async () => api?.exportAs("note"));

    expect(exportMdiText).toHaveBeenCalledWith("本文。", "note", ".mdi", indent, "作品.mdi");
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("note_output_completed", {
      operation: "export",
      format: "note",
    });
    expect(trackEvent).not.toHaveBeenCalledWith("document_output_completed", expect.anything());
  });

  it.each([
    ["cancelled", null],
    ["failed", { success: false, error: "private write failure" }],
  ] as const)("does not track a %s note export", async (_label, result) => {
    exportMdiText.mockResolvedValue(result);

    await act(async () => api?.exportAs("note"));

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("does not report success when the native save dialog is cancelled", async () => {
    exportMdiText.mockResolvedValue(null);

    await act(async () => api?.exportAs("txt"));

    expect(notifications.dismiss).toHaveBeenCalledWith("progress-id");
    expect(notifications.success).not.toHaveBeenCalled();
    expect(notifications.error).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("reports a structured main-process export failure", async () => {
    exportMdiText.mockResolvedValue({ success: false, error: "書き込みに失敗しました" });

    await act(async () => api?.exportAs("aozora"));

    expect(notifications.error).toHaveBeenCalledWith(
      "青空文庫形式のエクスポートに失敗しました: 書き込みに失敗しました",
    );
    expect(notifications.success).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("keeps a successful export successful when analytics delivery fails", async () => {
    exportMdiText.mockResolvedValue("/tmp/作品.txt");
    trackEvent.mockRejectedValueOnce(new Error("analytics offline"));

    await act(async () => api?.exportAs("txt"));

    expect(notifications.success).toHaveBeenCalledWith("テキストをエクスポートしました");
    expect(notifications.error).not.toHaveBeenCalled();
  });
});

describe("useExport native HTML export", () => {
  it("opens the shared settings dialog when the application provides it", async () => {
    await act(async () => root.render(<Harness withDialog />));

    await act(async () => api?.exportAs("html"));

    expect(requestExportDialog).toHaveBeenCalledWith("html", "本文。", {
      title: "作品.mdi",
      language: "ja",
    });
    expect(exportHTML).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("forwards live source, file type, and title to the main process", async () => {
    exportHTML.mockResolvedValue("/tmp/作品.html");

    await act(async () => api?.exportAs("html"));

    expect(exportHTML).toHaveBeenCalledWith("本文。", ".mdi", "作品.mdi");
    expect(trackEvent).toHaveBeenCalledWith("document_output_completed", {
      operation: "export",
      format: "html",
    });
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
    expect(trackEvent).not.toHaveBeenCalled();
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
    expect(trackEvent).toHaveBeenCalledWith("document_output_completed", {
      operation: "copy",
      format,
    });
    expect(notifications.dismiss).toHaveBeenCalledWith("progress-id");
    expect(notifications.success).toHaveBeenCalledWith(`${label}をクリップボードにコピーしました`);
  });

  it("tracks one successful formatted note copy with its dedicated event", async () => {
    copyMdiText.mockResolvedValue({ success: true });

    await act(async () => api?.copyAs("note"));

    expect(copyMdiText).toHaveBeenCalledWith("本文。", "note", ".mdi", indent);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("note_output_completed", {
      operation: "copy",
      format: "note",
    });
    expect(trackEvent).not.toHaveBeenCalledWith("document_output_completed", expect.anything());
  });

  it.each([
    ["cancelled", null],
    ["failed", { success: false, error: "private clipboard failure" }],
  ] as const)("does not track a %s formatted note copy", async (_label, result) => {
    if (result === null) requestTxtExportOptions.mockResolvedValueOnce(null);
    else copyMdiText.mockResolvedValue(result);

    await act(async () => api?.copyAs("note"));

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("does not render or notify when the indentation dialog is cancelled", async () => {
    requestTxtExportOptions.mockResolvedValueOnce(null);

    await act(async () => api?.copyAs("narou"));

    expect(copyMdiText).not.toHaveBeenCalled();
    expect(notifications.showProgress).not.toHaveBeenCalled();
    expect(notifications.success).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("reports a structured clipboard failure", async () => {
    copyMdiText.mockResolvedValue({ success: false, error: "クリップボードを利用できません" });

    await act(async () => api?.copyAs("aozora"));

    expect(notifications.error).toHaveBeenCalledWith(
      "青空文庫形式のクリップボードへのコピーに失敗しました: クリップボードを利用できません",
    );
    expect(notifications.success).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
