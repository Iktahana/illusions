import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EditorView } from "@milkdown/prose/view";

import Editor from "@/components/Editor";
import { getDocumentAdapter, type DocumentFormat } from "@/lib/document-format";
import type { EditorInteractionHandle } from "@/lib/editor-interaction";

const mockState = vi.hoisted(() => ({
  posHighlightEnabled: true,
  posHighlightColors: {},
  posHighlightDisabledTypes: [] as string[],
}));

const tokenizeDocument =
  vi.fn<
    (
      paragraphs: Array<{ pos: number; text: string }>,
    ) => Promise<Array<{ pos: number; tokens: Array<{ pos: string; start: number; end: number }> }>>
  >();

vi.mock("@/contexts/EditorSettingsContext", () => ({
  useTypographySettings: () => ({
    fontScale: 100,
    lineHeight: 1.8,
    paragraphSpacing: 0.5,
    textIndent: 1,
    fontFamily: "serif",
    charsPerLine: 40,
  }),
  usePosHighlightSettings: () => ({
    posHighlightEnabled: mockState.posHighlightEnabled,
    posHighlightColors: mockState.posHighlightColors,
    posHighlightDisabledTypes: mockState.posHighlightDisabledTypes,
    onPosHighlightEnabledChange: vi.fn(),
    onPosHighlightColorsChange: vi.fn(),
    onPosHighlightDisabledTypesChange: vi.fn(),
  }),
  usePowerSettings: () => ({
    powerSaveMode: false,
    autoPowerSaveOnBattery: false,
    onPowerSaveModeChange: vi.fn(),
    onTemporarilyDisablePowerSave: vi.fn(),
    onAutoPowerSaveOnBatteryChange: vi.fn(),
  }),
}));

vi.mock("@/lib/nlp-client/nlp-client", () => ({
  getNlpClient: () => ({
    tokenizeDocument,
  }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeAll(async () => {
  await getDocumentAdapter("mdi").initialize();
});

beforeEach(() => {
  tokenizeDocument.mockReset();
  mockState.posHighlightEnabled = true;
  mockState.posHighlightColors = {};
  mockState.posHighlightDisabledTypes = [];
  Object.defineProperty(document, "hasFocus", {
    configurable: true,
    value: () => true,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function mountEditor(
  format: DocumentFormat,
  source: string,
  overrides: Partial<React.ComponentProps<typeof Editor>> = {},
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let view: EditorView | null = null;
  let interaction: EditorInteractionHandle | null = null;

  await act(async () => {
    root?.render(
      <Editor
        initialContent={source}
        documentFormat={format}
        onEditorViewReady={(nextView) => {
          view = nextView;
        }}
        registerInteraction={(handle) => {
          interaction = handle;
        }}
        {...overrides}
      />,
    );
  });

  await vi.waitFor(() => expect(view).not.toBeNull());
  await vi.waitFor(() => expect(interaction).not.toBeNull());
  return {
    get view(): EditorView {
      if (!view) throw new Error("editor view is not ready");
      return view;
    },
    get interaction(): EditorInteractionHandle {
      if (!interaction) throw new Error("interaction is not ready");
      return interaction;
    },
  };
}

describe("POS highlight runtime", () => {
  it.each([
    ["markdown", "東京へ行く", "東京"],
    ["plain-text", "東京へ行く", "東京"],
  ] as const)(
    "highlights %s content through the editor interaction contract",
    async (format, source, _highlighted) => {
      tokenizeDocument.mockImplementation(async (paragraphs) =>
        paragraphs.map(({ pos }) => ({
          pos,
          tokens: [{ pos: "名詞", start: 0, end: 2 }],
        })),
      );

      await mountEditor(format, source);

      await vi.waitFor(() =>
        expect(container?.querySelectorAll('[data-pos-highlight-category="名詞"]').length).toBe(1),
      );
    },
  );

  it("maps MDI ruby / TCY content through provenance spans", async () => {
    tokenizeDocument.mockImplementation(async (paragraphs) =>
      paragraphs.map(({ pos, text }) => ({
        pos,
        tokens: text.includes("東京")
          ? [
              { pos: "名詞", start: 0, end: 2 },
              { pos: "助詞", start: 2, end: 3 },
            ]
          : [],
      })),
    );

    await mountEditor("mdi", "{東京|とうきょう}と^12^。\n");

    await vi.waitFor(() =>
      expect(
        container?.querySelectorAll('[data-pos-highlight-category="名詞"]').length,
      ).toBeGreaterThan(0),
    );
    expect(container?.querySelector("ruby[data-mdi-ruby]")).not.toBeNull();
  });

  it("does not re-run tokenization during IME composition", async () => {
    tokenizeDocument.mockImplementation(async (paragraphs) =>
      paragraphs.map(({ pos }) => ({
        pos,
        tokens: [{ pos: "名詞", start: 0, end: 2 }],
      })),
    );

    const editor = await mountEditor("markdown", "東京へ行く");
    await vi.waitFor(() => expect(tokenizeDocument).toHaveBeenCalledTimes(1));

    act(() => {
      (
        editor.interaction as EditorInteractionHandle & { setComposing: (value: boolean) => void }
      ).setComposing(true);
      editor.view.dispatch(
        editor.view.state.tr.insertText("！", editor.view.state.doc.content.size),
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(tokenizeDocument).toHaveBeenCalledTimes(1);
  });
});
