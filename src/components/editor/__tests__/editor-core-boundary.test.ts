import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readSource = (relativePath: string): string =>
  readFileSync(path.join(root, relativePath), "utf8");
const readJson = <T>(relativePath: string): T => JSON.parse(readSource(relativePath)) as T;

describe("new editor core boundary", () => {
  it("composes the editor from the MDI and vertical-writing packages", () => {
    const source = readSource("src/components/editor/MilkdownEditor.tsx");
    const globalStyles = readSource("src/app/globals.css");

    expect(source).toContain("getDocumentAdapter");
    expect(source).toContain("@illusions-lab/milkdown-plugin-vertical-writing");
    expect(readSource("src/lib/document-format/index.ts")).toContain(
      "@illusions-lab/milkdown-plugin-mdi",
    );
    expect(globalStyles).toContain('@import "@illusions-lab/milkdown-plugin-mdi/style.css"');
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

  it("keeps the official editor packages independent and on one Milkdown runtime", () => {
    const mdiPackage = readJson<{
      version: string;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    }>("node_modules/@illusions-lab/milkdown-plugin-mdi/package.json");
    const verticalPackage = readJson<{
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    }>("node_modules/@illusions-lab/milkdown-plugin-vertical-writing/package.json");
    const lock = readJson<{
      packages: Record<string, { version?: string; dependencies?: Record<string, string> }>;
    }>("package-lock.json");

    expect({ ...mdiPackage.dependencies, ...mdiPackage.peerDependencies }).not.toHaveProperty(
      "@illusions-lab/milkdown-plugin-vertical-writing",
    );
    expect(mdiPackage.version).toBe("0.4.0");
    expect({
      ...verticalPackage.dependencies,
      ...verticalPackage.peerDependencies,
    }).not.toHaveProperty("@illusions-lab/milkdown-plugin-mdi");

    for (const packageName of ["core", "ctx", "prose"]) {
      const suffix = `node_modules/@milkdown/${packageName}`;
      const installations = Object.entries(lock.packages).filter(([location]) =>
        location.endsWith(suffix),
      );
      expect(installations, packageName).toHaveLength(1);
      expect(installations[0]?.[1].version, packageName).toBe("7.22.0");
    }
  });

  it("keeps private MDI core and the removed editor package out of application dependencies", () => {
    const packageJson = readJson<{ dependencies?: Record<string, string> }>("package.json");
    const activeSources = [
      readSource("src/components/editor/MilkdownEditor.tsx"),
      readSource("src/lib/document-format/index.ts"),
      readSource("package.json"),
    ].join("\n");

    expect(packageJson.dependencies).not.toHaveProperty("@illusions-lab/mdi-core");
    expect(packageJson.dependencies).not.toHaveProperty("milkdown-plugin-japanese-novel");
    expect(activeSources).not.toContain('from "@illusions-lab/mdi-core"');
    expect(activeSources).not.toContain('from "milkdown-plugin-japanese-novel"');
  });

  it("renders block numbers only through the Rust projection and upstream provenance bridge", () => {
    const editor = readSource("src/components/editor/MilkdownEditor.tsx");
    const blockNumbers = readSource("src/lib/editor-page/mdi-block-numbers.ts");
    const typography = readSource("src/app/editor-typography.css");
    const search = readSource("src/lib/editor-page/find-search-matches.ts");

    expect(editor).toContain("setMdiBlockNumbers");
    expect(blockNumbers).toContain("getMdiTextBlocks");
    expect(blockNumbers).toContain("createMdiEditorMapping");
    expect(blockNumbers).toContain("mapMdiSourceSpansToEditorRanges");
    expect(blockNumbers).not.toContain("doc.descendants");
    expect(blockNumbers).not.toContain("snapshot.doc.textContent");
    expect(typography).not.toContain("counter-increment");
    expect(typography).not.toContain("counter-reset");
    expect(search).not.toContain("paragraphNumber");
  });
});
