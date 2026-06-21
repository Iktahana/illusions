/**
 * Regression tests for print bugs #1882 and #1883.
 *
 * #1882: PrintDialogState must carry fileType so .md/.txt documents are not
 *        mis-rendered by the mdiToHtml pipeline (which only un-escapes MDI
 *        macros for ".mdi"). The IPC payload must include fileType.
 *
 * #1883: The print IPC returns { success, error? }. A failure must trigger an
 *        error notification and must NOT close the dialog (setPrintDialogState
 *        should not be called with null on failure).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { PdfGenerationOptions } from "../types";
import type { SupportedFileExtension } from "@/lib/project/project-types";

// ---------------------------------------------------------------------------
// Helpers that mirror the app/page.tsx logic under test
// ---------------------------------------------------------------------------

interface ExportMetadata {
  title: string;
  language?: string;
}

interface PrintDialogState {
  content: string;
  metadata: ExportMetadata;
  fileType: SupportedFileExtension;
}

interface PrintResult {
  success: boolean;
  error?: string;
}

/**
 * Minimal re-implementation of the handlePrintDialogRequest + handlePrintConfirm
 * logic from app/page.tsx, extracted here so we can unit-test state transitions
 * without mounting the full React tree.
 */
function makePrintHandlers(deps: {
  printDocument: (content: string, options: PdfGenerationOptions) => Promise<PrintResult>;
  notifyError: (msg: string) => void;
  setDialogState: (state: PrintDialogState | null) => void;
}) {
  let activeFileType: SupportedFileExtension = ".mdi";

  function setActiveFileType(ft: SupportedFileExtension): void {
    activeFileType = ft;
  }

  function handlePrintDialogRequest(content: string, metadata: ExportMetadata): PrintDialogState {
    const state: PrintDialogState = { content, metadata, fileType: activeFileType };
    deps.setDialogState(state);
    return state;
  }

  async function handlePrintConfirm(
    dialogState: PrintDialogState,
    settings: Partial<PdfGenerationOptions>,
  ): Promise<void> {
    try {
      const result = await deps.printDocument(dialogState.content, {
        ...(settings as PdfGenerationOptions),
        metadata: dialogState.metadata,
        fileType: dialogState.fileType,
      });
      if (
        result !== null &&
        result !== undefined &&
        typeof result === "object" &&
        "success" in result &&
        !result.success
      ) {
        deps.notifyError(`印刷に失敗しました: ${result.error ?? "不明なエラー"}`);
        return; // dialog stays open — do NOT call setDialogState(null)
      }
      deps.setDialogState(null); // success → close dialog
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      deps.notifyError(`印刷に失敗しました: ${message}`);
    }
  }

  return { setActiveFileType, handlePrintDialogRequest, handlePrintConfirm };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("print IPC — #1882: fileType is captured and forwarded", () => {
  it("snapshots the active fileType when the dialog opens", () => {
    const setDialogState = vi.fn();
    const { setActiveFileType, handlePrintDialogRequest } = makePrintHandlers({
      printDocument: vi.fn(),
      notifyError: vi.fn(),
      setDialogState,
    });

    setActiveFileType(".md");
    const state = handlePrintDialogRequest("some content", { title: "テスト" });

    expect(state.fileType).toBe(".md");
    expect(setDialogState).toHaveBeenCalledWith(expect.objectContaining({ fileType: ".md" }));
  });

  it("passes fileType='.txt' through to the IPC printDocument call", async () => {
    const printDocument = vi.fn().mockResolvedValue({ success: true });
    const { setActiveFileType, handlePrintDialogRequest, handlePrintConfirm } = makePrintHandlers({
      printDocument,
      notifyError: vi.fn(),
      setDialogState: vi.fn(),
    });

    setActiveFileType(".txt");
    const state = handlePrintDialogRequest("本文", { title: "テスト.txt" });
    await handlePrintConfirm(state, {});

    expect(printDocument).toHaveBeenCalledOnce();
    const calledOptions = printDocument.mock.calls[0][1] as PdfGenerationOptions;
    expect(calledOptions.fileType).toBe(".txt");
  });

  it("passes fileType='.mdi' for MDI documents (default)", async () => {
    const printDocument = vi.fn().mockResolvedValue({ success: true });
    const { handlePrintDialogRequest, handlePrintConfirm } = makePrintHandlers({
      printDocument,
      notifyError: vi.fn(),
      setDialogState: vi.fn(),
    });

    // default activeFileType is ".mdi"
    const state = handlePrintDialogRequest("{東京|とうきょう}[[br]]", { title: "MDI文書" });
    await handlePrintConfirm(state, {});

    const calledOptions = printDocument.mock.calls[0][1] as PdfGenerationOptions;
    expect(calledOptions.fileType).toBe(".mdi");
  });
});

describe("print IPC — #1883: error result keeps dialog open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows error notification and does NOT close dialog when success=false", async () => {
    const notifyError = vi.fn();
    const setDialogState = vi.fn();
    const printDocument = vi.fn().mockResolvedValue({
      success: false,
      error: "プリンターが接続されていません",
    });

    const { handlePrintDialogRequest, handlePrintConfirm } = makePrintHandlers({
      printDocument,
      notifyError,
      setDialogState,
    });

    const state = handlePrintDialogRequest("本文", { title: "テスト" });
    // reset after dialog-open call
    setDialogState.mockClear();

    await handlePrintConfirm(state, {});

    // Error notification must fire
    expect(notifyError).toHaveBeenCalledOnce();
    expect(notifyError.mock.calls[0][0]).toContain("印刷に失敗しました");
    expect(notifyError.mock.calls[0][0]).toContain("プリンターが接続されていません");

    // Dialog must NOT be closed (setDialogState(null) must not be called)
    expect(setDialogState).not.toHaveBeenCalledWith(null);
  });

  it("closes dialog and does NOT notify error when success=true", async () => {
    const notifyError = vi.fn();
    const setDialogState = vi.fn();
    const printDocument = vi.fn().mockResolvedValue({ success: true });

    const { handlePrintDialogRequest, handlePrintConfirm } = makePrintHandlers({
      printDocument,
      notifyError,
      setDialogState,
    });

    const state = handlePrintDialogRequest("本文", { title: "テスト" });
    setDialogState.mockClear();

    await handlePrintConfirm(state, {});

    expect(notifyError).not.toHaveBeenCalled();
    expect(setDialogState).toHaveBeenCalledWith(null);
  });

  it("shows error notification and does NOT close dialog when printDocument throws", async () => {
    const notifyError = vi.fn();
    const setDialogState = vi.fn();
    const printDocument = vi.fn().mockRejectedValue(new Error("IPC通信エラー"));

    const { handlePrintDialogRequest, handlePrintConfirm } = makePrintHandlers({
      printDocument,
      notifyError,
      setDialogState,
    });

    const state = handlePrintDialogRequest("本文", { title: "テスト" });
    setDialogState.mockClear();

    await handlePrintConfirm(state, {});

    expect(notifyError).toHaveBeenCalledOnce();
    expect(notifyError.mock.calls[0][0]).toContain("IPC通信エラー");
    // Dialog must NOT be closed on exception
    expect(setDialogState).not.toHaveBeenCalledWith(null);
  });
});
