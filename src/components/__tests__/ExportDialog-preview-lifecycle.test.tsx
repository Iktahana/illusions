import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_EXPORT_SETTINGS, type UnifiedExportSettings } from "@/lib/export/export-settings";

vi.mock("@/lib/utils/runtime-env", () => ({ isElectronRenderer: () => true }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthSafe: () => null }));
vi.mock("@/shared/ui/GlassDialog", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/explorer/FontSelector", () => ({ FontSelector: () => null }));
vi.mock("@/components/PageSizeSelector", () => ({ PageSizeSelector: () => null }));
const exportSettingsMocks = vi.hoisted(() => ({
  loadExportSettings: vi.fn(),
  saveExportSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/export/export-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/export/export-settings")>();
  return {
    ...actual,
    loadExportSettings: exportSettingsMocks.loadExportSettings,
    saveExportSettings: exportSettingsMocks.saveExportSettings,
  };
});

const { default: ExportDialog } = await import("../ExportDialog");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PreviewSuccess = {
  success: true;
  data: Uint8Array<ArrayBuffer>;
  maxPages: number;
  automaticMaxPages: number;
  systemMemoryGiB: number;
  sourceCharacterLimit: number;
  sourceTruncated: boolean;
};

function previewResult(byte: number): PreviewSuccess {
  return {
    success: true,
    data: new Uint8Array([byte]),
    maxPages: 300,
    automaticMaxPages: 300,
    systemMemoryGiB: 32,
    sourceCharacterLimit: 360_000,
    sourceTruncated: false,
  };
}

function storedSettings(charsPerLine: number): UnifiedExportSettings {
  return { ...DEFAULT_EXPORT_SETTINGS, charsPerLine };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const generatePdfPreview = vi.fn();
const cancelPdfPreview = vi.fn().mockResolvedValue(true);
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
const controlledReaders: ControlledFileReader[] = [];
let root: Root | null;
let container: HTMLDivElement;

class ControlledFileReader {
  result: ArrayBuffer | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;
  abort = vi.fn(() => {
    this.onabort?.(new ProgressEvent("abort") as ProgressEvent<FileReader>);
  });

  constructor() {
    controlledReaders.push(this);
  }

  readAsArrayBuffer(): void {}

  resolve(bytes: number[]): void {
    this.result = new Uint8Array(bytes).buffer;
    this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
  }
}

function render(content: string) {
  root?.render(
    <ExportDialog
      isOpen
      initialFormat="pdf"
      onClose={vi.fn()}
      onExportPdf={vi.fn()}
      onExportDocx={vi.fn()}
      content={content}
      metadata={{ title: "プレビューテスト" }}
      fileType=".mdi"
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  generatePdfPreview.mockReset();
  cancelPdfPreview.mockClear();
  createObjectURL.mockReset();
  revokeObjectURL.mockReset();
  controlledReaders.length = 0;
  exportSettingsMocks.loadExportSettings.mockReset();
  exportSettingsMocks.loadExportSettings.mockReturnValue(new Promise(() => undefined));
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: { generatePdfPreview, cancelPdfPreview },
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
  Object.defineProperty(globalThis, "FileReader", {
    configurable: true,
    value: ControlledFileReader,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("ExportDialog PDF preview lifecycle", () => {
  it("does not overwrite an immediate user edit when stored settings finish loading", async () => {
    const loaded = deferred<UnifiedExportSettings>();
    exportSettingsMocks.loadExportSettings.mockReturnValue(loaded.promise);

    await act(async () => render("本文"));
    const charsPerLineInput = Array.from(container.querySelectorAll("input[type=number]")).find(
      (input) => (input as HTMLInputElement).value === "40",
    ) as HTMLInputElement | undefined;
    expect(charsPerLineInput).toBeDefined();

    await act(async () => {
      if (!charsPerLineInput) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(charsPerLineInput, "35");
      charsPerLineInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(charsPerLineInput?.value).toBe("35");

    await act(async () => loaded.resolve(storedSettings(22)));
    expect(charsPerLineInput?.value).toBe("35");
  });

  it("ignores stale generation results after the source changes", async () => {
    const first = deferred<PreviewSuccess>();
    const second = deferred<PreviewSuccess>();
    generatePdfPreview.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    createObjectURL.mockReturnValue("blob:current-preview");

    await act(async () => render("最初の本文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(generatePdfPreview).toHaveBeenCalledTimes(1);

    await act(async () => render("更新後の本文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(generatePdfPreview).toHaveBeenCalledTimes(2);

    await act(async () => first.resolve(previewResult(1)));
    expect(createObjectURL).not.toHaveBeenCalled();

    await act(async () => second.resolve(previewResult(2)));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(container.querySelector("embed")?.getAttribute("src")).toBe(
      "blob:current-preview#view=FitH",
    );
    expect(cancelPdfPreview).toHaveBeenCalled();
  });

  it("revokes the base Blob URL when replacing and unmounting previews", async () => {
    generatePdfPreview
      .mockResolvedValueOnce(previewResult(1))
      .mockResolvedValueOnce(previewResult(2));
    createObjectURL.mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");

    await act(async () => render("最初の本文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(container.querySelector("embed")?.getAttribute("src")).toBe("blob:first#view=FitH");

    await act(async () => render("更新後の本文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:first#view=FitH");

    await act(async () => root?.unmount());
    root = null;
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second");
  });

  it("shows a new generation error instead of leaving the old preview visible", async () => {
    generatePdfPreview
      .mockResolvedValueOnce(previewResult(1))
      .mockResolvedValueOnce({ success: false, error: "プレビュー生成エラー" });
    createObjectURL.mockReturnValue("blob:old-preview");

    await act(async () => render("最初の本文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(container.querySelector("embed")).not.toBeNull();

    await act(async () => render("エラーになる本文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));

    expect(container.textContent).toContain("プレビュー生成エラー");
    expect(container.querySelector("embed")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:old-preview");
  });

  it("releases the old preview when regeneration throws", async () => {
    generatePdfPreview
      .mockResolvedValueOnce(previewResult(1))
      .mockRejectedValueOnce(new Error("IPC接続エラー"));
    createObjectURL.mockReturnValue("blob:old-preview");

    await act(async () => render("最初の本文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(container.querySelector("embed")).not.toBeNull();

    await act(async () => render("通信に失敗する本文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));

    expect(container.textContent).toContain("IPC接続エラー");
    expect(container.querySelector("embed")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:old-preview");
  });

  it("releases the preview when switching to EPUB", async () => {
    generatePdfPreview.mockResolvedValue(previewResult(1));
    createObjectURL.mockReturnValue("blob:pdf-preview");

    await act(async () => render("本文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    const epubButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "EPUB",
    );
    expect(epubButton).toBeDefined();

    await act(async () => epubButton?.click());

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pdf-preview");
    expect(container.querySelector("embed")).toBeNull();
    expect(cancelPdfPreview).toHaveBeenCalled();
  });

  it("ignores a stale cover read when a newer image finishes first", async () => {
    createObjectURL.mockReturnValue("blob:new-cover");
    await act(async () => render("本文"));
    const epubButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "EPUB",
    );
    await act(async () => epubButton?.click());

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });

    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [first] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [second] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(controlledReaders).toHaveLength(2);
    expect(controlledReaders[0].abort).toHaveBeenCalledOnce();

    await act(async () => controlledReaders[1].resolve([2]));
    await act(async () => controlledReaders[0].resolve([1]));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(container.querySelector('img[alt="表紙プレビュー"]')?.getAttribute("src")).toBe(
      "blob:new-cover",
    );
  });
});
