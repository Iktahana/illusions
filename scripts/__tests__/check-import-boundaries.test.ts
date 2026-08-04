import { describe, expect, it } from "vitest";

import {
  extractModuleSpecifiers,
  normalizeSourcePath,
  validateImportBoundary,
} from "../check-import-boundaries.mjs";

describe("import boundary checker", () => {
  it("extracts static, dynamic, and CommonJS imports", () => {
    const source = `
      import value from "@/shared/value";
      export { other } from "@/features/editor";
      const lazy = import("@/features/search");
      const chunk = import(/* webpackChunkName: "browser-storage" */ "@/platform/browser/storage");
      const lineCommentChunk = import(
        // webpackChunkName: "browser-vfs"
        "@/platform/browser/vfs"
      );
      const legacy = require("@/lib/legacy");
      vi.mock("@/platform/browser/storage", () => ({}));
    `;

    expect(extractModuleSpecifiers(source)).toEqual([
      "@/shared/value",
      "@/features/editor",
      "@/features/search",
      "@/platform/browser/storage",
      "@/platform/browser/vfs",
      "@/lib/legacy",
    ]);
  });

  describe("src/ layout normalization", () => {
    it("strips only a leading src/ segment", () => {
      expect(normalizeSourcePath("src/lib/storage/storage-service.ts")).toBe(
        "lib/storage/storage-service.ts",
      );
      expect(normalizeSourcePath("src/shared/lib/format.ts")).toBe("shared/lib/format.ts");
    });

    it("leaves package paths untouched, including their own src/ subdirectories", () => {
      expect(normalizeSourcePath("packages/example/src/index.ts")).toBe(
        "packages/example/src/index.ts",
      );
      expect(normalizeSourcePath("electron/lib/ipc-channels.js")).toBe(
        "electron/lib/ipc-channels.js",
      );
    });

    it("does not strip src when it is a filename prefix rather than a directory", () => {
      expect(normalizeSourcePath("src-utils/helper.ts")).toBe("src-utils/helper.ts");
      expect(normalizeSourcePath("srcfile.ts")).toBe("srcfile.ts");
    });

    it("keeps boundary rules effective for files under src/", () => {
      expect(
        validateImportBoundary(normalizeSourcePath("src/components/Editor.tsx"), "@/electron/main"),
      ).toContain("preload");
      expect(
        validateImportBoundary(
          normalizeSourcePath("src/shared/lib/format.ts"),
          "@/features/editor",
        ),
      ).toContain("shared code");
      expect(
        validateImportBoundary(normalizeSourcePath("src/lib/utils/index.ts"), "@/shared/lib/text"),
      ).toBeNull();
    });

    it("normalizes src paths before matching exact browser-platform exceptions", () => {
      expect(
        validateImportBoundary("src/lib/storage/storage-service.ts", "@/platform/browser/storage"),
      ).toBeNull();
      expect(
        validateImportBoundary("src/lib/storage/another-service.ts", "@/platform/browser/storage"),
      ).toContain("browser-platform");
    });
  });

  it("rejects a new package-to-application import", () => {
    expect(
      validateImportBoundary("packages/example/index.ts", "@/lib/storage/storage-service"),
    ).toContain("package code");
  });

  it("allows only an exact inherited package exception", () => {
    expect(
      validateImportBoundary(
        "packages/milkdown-plugin-japanese-novel/pos-highlight/decoration-plugin.ts",
        "@/lib/nlp-client/nlp-client",
      ),
    ).toBeNull();
    expect(
      validateImportBoundary(
        "packages/milkdown-plugin-japanese-novel/pos-highlight/decoration-plugin.ts",
        "@/lib/project/project-service",
      ),
    ).toContain("package code");
  });

  it("rejects Electron main imports from renderer code", () => {
    expect(
      validateImportBoundary("features/editor/model/use-editor.ts", "@/electron/main"),
    ).toContain("preload");
  });

  it("rejects shared-to-feature imports", () => {
    expect(validateImportBoundary("shared/lib/format.ts", "@/features/editor")).toContain(
      "shared code",
    );
  });

  it("requires cross-feature callers to use public entrypoints", () => {
    expect(
      validateImportBoundary(
        "features/editor/model/controller.ts",
        "@/features/search/model/search-store",
      ),
    ).toContain("public entrypoint");
    expect(
      validateImportBoundary("features/editor/model/controller.ts", "@/features/search"),
    ).toBeNull();
  });

  describe("browser-platform imports", () => {
    it("allows only exact inherited file and specifier pairs", () => {
      expect(
        validateImportBoundary("lib/project/project-manager.ts", "@/platform/browser/storage"),
      ).toBeNull();
      expect(
        validateImportBoundary("lib/project/project-manager.ts", "@/platform/browser/vfs"),
      ).toContain("browser-platform");
    });

    it("rejects browser-platform aliases from new renderer callers", () => {
      expect(
        validateImportBoundary("features/editor/model/controller.ts", "@/platform/browser/storage"),
      ).toContain("browser-platform");
      expect(validateImportBoundary("application/bootstrap.ts", "@/platform/browser")).toContain(
        "browser-platform",
      );
      expect(
        validateImportBoundary(
          "features/editor/model/controller.ts",
          "@/platform/./browser/storage",
        ),
      ).toContain("browser-platform");
    });

    it("rejects equivalent relative browser-platform imports", () => {
      expect(
        validateImportBoundary(
          "lib/storage/new-storage-service.ts",
          "../../platform/browser/storage",
        ),
      ).toContain("browser-platform");
      expect(
        validateImportBoundary(
          "features/editor/model/controller.ts",
          "../../../platform/browser/vfs",
        ),
      ).toContain("browser-platform");
    });

    it("resolves relative imports against physical src paths before normalization", () => {
      expect(
        validateImportBoundary("src/lib/example.ts", "../../src/platform/browser/storage"),
      ).toContain("browser-platform");
      expect(
        validateImportBoundary("packages/example/index.ts", "../../src/platform/browser/storage"),
      ).toContain("browser-platform");
    });
  });
});
