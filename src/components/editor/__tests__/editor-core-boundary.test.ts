import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readSource = (relativePath: string): string =>
  readFileSync(path.join(root, relativePath), "utf8");

describe("new editor core boundary", () => {
  it("composes the editor from the MDI and vertical-writing packages", () => {
    const source = readSource("src/components/editor/MilkdownEditor.tsx");

    expect(source).toContain("getDocumentAdapter");
    expect(source).toContain("@illusions-lab/milkdown-plugin-vertical-writing");
    expect(readSource("src/lib/document-format/index.ts")).toContain(
      "@illusions-lab/milkdown-plugin-mdi",
    );
  });

  it("does not load removed application feature plugins into the core", () => {
    const source = [
      readSource("src/components/Editor.tsx"),
      readSource("src/components/editor/MilkdownEditor.tsx"),
    ].join("\n");
    const removedFeatures = [
      "BubbleMenu",
      "EditorContextMenu",
      "EditorToolbar",
      "SelectionCounter",
      "linting-plugin",
      "novel-editor-features",
      "pos-highlight",
      "search-highlight-plugin",
      "speech-highlight-plugin",
      "use-selection-tracking",
    ];

    for (const feature of removedFeatures) expect(source).not.toContain(feature);
  });

  it("keeps deleted legacy implementation entry points absent", () => {
    const removedPaths = [
      "src/components/BubbleMenu.tsx",
      "src/components/EditorContextMenu.tsx",
      "src/components/editor/EditorToolbar.tsx",
      "src/lib/editor-page/linting-plugin/index.ts",
      "src/lib/editor-page/novel-editor-features/index.ts",
      "src/lib/editor-page/pos-highlight/index.ts",
      "src/lib/editor-page/use-selection-tracking.ts",
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(path.join(root, relativePath)), relativePath).toBe(false);
    }
  });
});
