import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronState = vi.hoisted(() => ({
  failPrint: false,
  printDelayMs: 0,
  printResult: Buffer.from("%PDF-1.7\n%%EOF"),
  printOptions: null as Record<string, unknown> | null,
  loadCount: 0,
  onWindowCreated: undefined as (() => void) | undefined,
  windows: [] as Array<{ destroyed: boolean }>,
}));

vi.mock("electron", () => ({
  BrowserWindow: class MockBrowserWindow {
    destroyed = false;
    private protocolHandler?: (request: { url: string }) => Response;
    webContents = {
      session: {
        protocol: {
          handle: (_scheme: string, handler: (request: { url: string }) => Response) => {
            this.protocolHandler = handler;
          },
          unhandle: vi.fn(),
        },
      },
      executeJavaScript: vi.fn().mockResolvedValue(true),
      printToPDF: vi.fn(async (printOptions: Record<string, unknown>) => {
        electronState.printOptions = printOptions;
        if (electronState.failPrint) throw new Error("PDF generation failed");
        if (electronState.printDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, electronState.printDelayMs));
        }
        return electronState.printResult;
      }),
    };

    constructor() {
      electronState.windows.push(this);
      electronState.onWindowCreated?.();
    }

    async loadURL(url: string) {
      electronState.loadCount += 1;
      const response = this.protocolHandler?.({ url });
      if (!response || !(await response.text()).includes("<html")) {
        throw new Error("print document was not loaded");
      }
    }

    isDestroyed() {
      return this.destroyed;
    }

    destroy() {
      this.destroyed = true;
    }
  },
}));

const { generatePdfPreview, writePdfToFile } = await import("../pdf-exporter");

const options = {
  metadata: { title: "長編テスト" },
  pageSize: "A4",
  charsPerLine: 40,
  linesPerPage: 30,
  fileType: ".mdi",
};

let testDirectory: string;

beforeEach(async () => {
  await fs.mkdir(path.resolve("tmp/pdfs"), { recursive: true });
  testDirectory = await fs.mkdtemp(path.resolve("tmp/pdfs/pdf-stream-unit-"));
  electronState.failPrint = false;
  electronState.printDelayMs = 0;
  electronState.printResult = Buffer.from("%PDF-1.7\n%%EOF");
  electronState.printOptions = null;
  electronState.loadCount = 0;
  electronState.onWindowCreated = undefined;
  electronState.windows.length = 0;
});

afterEach(async () => {
  await fs.rm(testDirectory, { recursive: true, force: true });
});

describe("writePdfToFile", () => {
  it("writes Chromium output to an atomic sibling file", async () => {
    const target = path.join(testDirectory, "novel.pdf");

    await writePdfToFile("本文。", options, target);

    expect(await fs.readFile(target, "utf8")).toBe("%PDF-1.7\n%%EOF");
    expect(await fs.readdir(testDirectory)).toEqual(["novel.pdf"]);
    expect(electronState.printOptions).toMatchObject({ preferCSSPageSize: true });
    expect(electronState.windows).toHaveLength(1);
    expect(electronState.windows[0].destroyed).toBe(true);
  });

  it("removes its temporary file and preserves the target when generation fails", async () => {
    const target = path.join(testDirectory, "existing.pdf");
    await fs.writeFile(target, "previous PDF");
    electronState.failPrint = true;

    await expect(writePdfToFile("本文。", options, target)).rejects.toThrow(
      "PDF generation failed",
    );

    expect(await fs.readFile(target, "utf8")).toBe("previous PDF");
    expect(await fs.readdir(testDirectory)).toEqual(["existing.pdf"]);
    expect(electronState.windows[0].destroyed).toBe(true);
  });

  it("cancels generation without replacing the target or leaking a temporary file", async () => {
    const target = path.join(testDirectory, "existing.pdf");
    await fs.writeFile(target, "previous PDF");
    electronState.printDelayMs = 25;
    const controller = new AbortController();

    const writing = writePdfToFile("本文。", options, target, { signal: controller.signal });
    setTimeout(() => controller.abort(), 1);

    await expect(writing).rejects.toMatchObject({ name: "AbortError" });
    expect(await fs.readFile(target, "utf8")).toBe("previous PDF");
    expect(await fs.readdir(testDirectory)).toEqual(["existing.pdf"]);
    expect(electronState.windows[0].destroyed).toBe(true);
  });
});

describe("generatePdfPreview", () => {
  it("enforces the absolute page limit in the Chromium page range", async () => {
    const result = await generatePdfPreview("本文。", options, { maxPages: 999 });

    expect(result.maxPages).toBe(500);
    expect(result.pdf).toBe(electronState.printResult);
    expect(electronState.printOptions).toMatchObject({ pageRanges: "1-500" });
    expect(electronState.windows[0].destroyed).toBe(true);
  });

  it("does not load the document when cancellation wins during window creation", async () => {
    const controller = new AbortController();
    electronState.onWindowCreated = () => controller.abort();

    await expect(
      generatePdfPreview("本文。", options, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(electronState.loadCount).toBe(0);
    expect(electronState.printOptions).toBeNull();
    expect(electronState.windows[0].destroyed).toBe(true);
  });
});
