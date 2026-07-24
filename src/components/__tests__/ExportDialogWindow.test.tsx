import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const completeExportDialog = vi.fn();
const getExportDialogRequest = vi.fn();
const txtDialogProps: Array<Record<string, unknown>> = [];
const exportDialogProps: Array<Record<string, unknown>> = [];

vi.mock("../TxtExportDialog", () => ({
  default: (props: Record<string, unknown>) => {
    txtDialogProps.push(props);
    return (
      <div>
        <button type="button" onClick={() => (props.onCancel as () => void)()}>
          txt-cancel
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onConfirm as (options: Record<string, unknown>) => void)({
              fullwidthSpaceIndent: false,
              indentCount: 3,
            })
          }
        >
          txt-confirm
        </button>
      </div>
    );
  },
}));

vi.mock("../ExportDialog", () => ({
  default: (props: Record<string, unknown>) => {
    exportDialogProps.push(props);
    return (
      <div>
        <button
          type="button"
          onClick={() =>
            (props.onExportHtml as (options: Record<string, unknown>) => void)({
              bodyOnly: false,
              writingMode: "vertical",
            })
          }
        >
          export-html
        </button>
        <button type="button" onClick={() => (props.onClose as () => void)()}>
          doc-cancel
        </button>
      </div>
    );
  },
}));

const { default: ExportDialogWindow } = await import("../ExportDialogWindow");

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../ExportDialogWindow.tsx"), "utf8");

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  txtDialogProps.length = 0;
  exportDialogProps.length = 0;
  completeExportDialog.mockReset();
  getExportDialogRequest.mockReset();

  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: {
      getExportDialogRequest,
      completeExportDialog,
    },
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function flushAsyncState(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ExportDialogWindow", () => {
  it("hosts both document and TXT export settings and returns their selection", () => {
    expect(source).toContain("<ExportDialog");
    expect(source).toContain("<TxtExportDialog");
    expect(source.match(/presentation=\"window\"/g)).toHaveLength(2);
    expect(source.match(/confirmDiscard=\{confirmDiscard\}/g)).toHaveLength(2);
    expect(source).toContain("confirmExportDialogDiscard");
    expect(source).toContain("completeExportDialog");
  });

  it("passes native completion callback and window mode to TXT dialog", async () => {
    getExportDialogRequest.mockResolvedValue({
      kind: "txt",
      format: "txt-ruby",
      operation: "copy",
    });

    await act(async () => {
      root.render(<ExportDialogWindow />);
    });
    await flushAsyncState();

    expect(txtDialogProps).toHaveLength(1);
    expect(txtDialogProps[0]).toMatchObject({
      format: "txt-ruby",
      presentation: "window",
      operation: "copy",
    });
    expect(typeof txtDialogProps[0].confirmDiscard).toBe("function");

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "txt-confirm",
    );
    expect(confirmButton).not.toBeNull();

    await act(async () => {
      confirmButton?.click();
    });

    expect(completeExportDialog).toHaveBeenCalledOnce();
    expect(completeExportDialog).toHaveBeenCalledWith({
      kind: "txt",
      options: {
        fullwidthSpaceIndent: false,
        indentCount: 3,
      },
    });
  });

  it("returns null on TXT cancel and closes through completeExportDialog", async () => {
    getExportDialogRequest.mockResolvedValue({ kind: "txt", format: "txt", operation: "export" });

    await act(async () => {
      root.render(<ExportDialogWindow />);
    });
    await flushAsyncState();

    const cancelButton = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "txt-cancel",
    );
    expect(cancelButton).not.toBeNull();

    await act(async () => {
      cancelButton?.click();
    });

    expect(completeExportDialog).toHaveBeenCalledOnce();
    expect(completeExportDialog).toHaveBeenCalledWith(null);
  });

  it("routes document export selection to completion with explicit format", async () => {
    getExportDialogRequest.mockResolvedValue({
      kind: "document",
      format: "pdf",
      content: "本文",
      metadata: { title: "タイトル" },
      fileType: ".mdi",
    });

    await act(async () => {
      root.render(<ExportDialogWindow />);
    });
    await flushAsyncState();

    expect(exportDialogProps).toHaveLength(1);
    expect(exportDialogProps[0]).toMatchObject({
      initialFormat: "pdf",
      presentation: "window",
      fileType: ".mdi",
      content: "本文",
    });
    expect(typeof exportDialogProps[0].confirmDiscard).toBe("function");

    const htmlButton = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "export-html",
    );
    expect(htmlButton).not.toBeNull();

    await act(async () => {
      htmlButton?.click();
    });

    expect(completeExportDialog).toHaveBeenCalledWith({
      kind: "document",
      format: "html",
      options: { bodyOnly: false, writingMode: "vertical" },
    });
  });

  it("does not render a form when getExportDialogRequest is unavailable", async () => {
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { completeExportDialog },
    });

    await act(async () => {
      root.render(<ExportDialogWindow />);
    });
    await flushAsyncState();

    expect(container.textContent).toContain("エクスポート");
    expect(container.querySelector("button")).toBeNull();
  });
});
