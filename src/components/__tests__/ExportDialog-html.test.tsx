import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_EXPORT_SETTINGS } from "@/lib/export/export-settings";

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const generateHtmlPreview = vi.fn();
const onExportHtml = vi.fn();
let root: Root;
let container: HTMLDivElement;

function renderDialog(): void {
  root.render(
    <ExportDialog
      isOpen
      initialFormat="html"
      onClose={vi.fn()}
      onExportHtml={onExportHtml}
      onExportPdf={vi.fn()}
      onExportDocx={vi.fn()}
      content={"# 第一章\n\n本文。"}
      metadata={{ title: "HTMLテスト" }}
      fileType=".mdi"
    />,
  );
}

function button(label: string): HTMLButtonElement {
  const normalizedLabel = label.replace(/\s/g, "");
  const found = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.replace(/\s/g, "") === normalizedLabel,
  );
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

async function flushPreview(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  exportSettingsMocks.loadExportSettings.mockResolvedValue(DEFAULT_EXPORT_SETTINGS);
  generateHtmlPreview.mockImplementation(
    async (_content: string, _fileType: string, options: { bodyOnly?: boolean }) => ({
      success: true,
      html: options.bodyOnly
        ? "<h1>第一章</h1><p>本文。</p>"
        : "<!DOCTYPE html><html><body><h1>第一章</h1><p>本文。</p></body></html>",
    }),
  );
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: { generateHtmlPreview },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => renderDialog());
  await flushPreview();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ExportDialog HTML options and iframe preview", () => {
  it("shows only the upstream HTML option and renders a sandboxed iframe", () => {
    expect(container.textContent).toContain("出力範囲");
    expect(container.textContent).toContain("完全なHTML文書");
    expect(container.textContent).toContain("本文のみ");
    expect(container.textContent).not.toContain("用紙サイズ");

    expect(generateHtmlPreview).toHaveBeenCalledWith("# 第一章\n\n本文。", ".mdi", {
      bodyOnly: false,
    });
    const iframe = container.querySelector("iframe");
    expect(iframe?.title).toBe("HTMLプレビュー");
    expect(iframe?.getAttribute("srcdoc")).toContain("<!DOCTYPE html>");
    expect(iframe?.hasAttribute("sandbox")).toBe(true);
    expect(iframe?.getAttribute("sandbox")).toBe("");
    expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("previews and exports the selected bodyOnly option", async () => {
    await act(async () => button("本文のみbody要素の中身だけを書き出します").click());
    await flushPreview();

    expect(generateHtmlPreview).toHaveBeenLastCalledWith("# 第一章\n\n本文。", ".mdi", {
      bodyOnly: true,
    });
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toBe(
      "<h1>第一章</h1><p>本文。</p>",
    );

    await act(async () => button("HTMLとしてエクスポート").click());
    expect(onExportHtml).toHaveBeenCalledWith({ bodyOnly: true });
    expect(exportSettingsMocks.saveExportSettings).toHaveBeenCalledWith(
      expect.objectContaining({ htmlBodyOnly: true }),
    );
  });

  it("ignores a stale preview result after the option changes", async () => {
    const oldPreview = deferred<{ success: true; html: string }>();
    const newPreview = deferred<{ success: true; html: string }>();
    generateHtmlPreview
      .mockReset()
      .mockReturnValueOnce(oldPreview.promise)
      .mockReturnValueOnce(newPreview.promise);

    await act(async () => button("本文のみbody要素の中身だけを書き出します").click());
    await act(async () => button("完全なHTML文書DOCTYPE、メタデータ、MDI用CSSを含めます").click());

    await act(async () => newPreview.resolve({ success: true, html: "<p>新しい結果</p>" }));
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toBe("<p>新しい結果</p>");

    await act(async () => oldPreview.resolve({ success: true, html: "<p>古い結果</p>" }));
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toBe("<p>新しい結果</p>");
  });

  it("shows a renderer error instead of a stale iframe", async () => {
    await act(async () => button("本文のみbody要素の中身だけを書き出します").click());
    await flushPreview();
    generateHtmlPreview.mockResolvedValueOnce({
      success: false,
      error: "HTMLプレビュー生成エラー",
    });

    await act(async () => button("完全なHTML文書DOCTYPE、メタデータ、MDI用CSSを含めます").click());
    await flushPreview();

    expect(container.textContent).toContain("HTMLプレビュー生成エラー");
    expect(container.querySelector("iframe")).toBeNull();
  });
});
