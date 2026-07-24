import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const completeCreateProjectDialog = vi.fn();

vi.mock("../CreateProjectWizard", () => ({
  default: ({
    onClose,
    onSubmit,
  }: {
    isOpen: boolean;
    presentation?: "overlay" | "window";
    onClose: () => void;
    onProjectCreated: () => void;
    onSubmit?: (selection: { name: string; fileExtension: ".mdi" | ".md" | ".txt" }) => void;
  }) => (
    <div>
      <button type="button" onClick={onClose}>
        close
      </button>
      <button type="button" onClick={() => onSubmit?.({ name: "sample", fileExtension: ".mdi" })}>
        submit
      </button>
    </div>
  ),
}));

const { default: CreateProjectWindow } = await import("../CreateProjectWindow");

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../CreateProjectWindow.tsx"), "utf8");
const pageSource = readFileSync(path.resolve(here, "../../app/page.tsx"), "utf8");

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  completeCreateProjectDialog.mockReset();

  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: {
      completeCreateProjectDialog,
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

describe("CreateProjectWindow", () => {
  it("uses the full-window wizard shell and returns only serializable settings", () => {
    expect(source).toContain('presentation="window"');
    expect(source).toContain("completeCreateProjectDialog");
    expect(source).toContain("onSubmit={complete}");
    expect(source).not.toContain("getProjectService");
  });

  it("falls back to the embedded wizard if a stale main process lacks the IPC handler", () => {
    expect(pageSource).toContain("selection = await openNativeDialog()");
    expect(pageSource).toContain("Native dialog unavailable; using web fallback");
    expect(pageSource).toContain("handleCreateProject()");
  });

  it("forwards close to the native completion callback", async () => {
    await act(async () => {
      root.render(<CreateProjectWindow />);
    });

    await act(async () => {
      container.querySelector("button")?.click();
    });

    expect(completeCreateProjectDialog).toHaveBeenCalledOnce();
    expect(completeCreateProjectDialog).toHaveBeenCalledWith(null);
  });

  it("forwards the submitted project selection to the native completion callback", async () => {
    await act(async () => {
      root.render(<CreateProjectWindow />);
    });

    const buttons = container.querySelectorAll("button");
    await act(async () => {
      buttons.item(1).click();
    });

    expect(completeCreateProjectDialog).toHaveBeenCalledOnce();
    expect(completeCreateProjectDialog).toHaveBeenCalledWith({
      name: "sample",
      fileExtension: ".mdi",
    });
  });
});
