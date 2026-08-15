import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/build.yml"), "utf8");

describe("packaged release smoke workflow", () => {
  it("tests the x64 NSIS artifact produced by the current build", () => {
    expect(workflow).toContain("packaged-smoke-windows:");
    expect(workflow).toContain(
      "name: illusions-windows-x64-${{ needs.compute-version.outputs.full }}",
    );
    expect(workflow).toContain("Get-AuthenticodeSignature");
    expect(workflow).toContain("npm run test:e2e:smoke");
  });

  it("tests signed x64 and arm64 macOS ZIP artifacts on native runners", () => {
    expect(workflow).toContain("packaged-smoke-macos:");
    expect(workflow).toContain("os: macos-15-intel");
    expect(workflow).toContain("os: macos-15");
    expect(workflow).toContain(
      "name: illusions-macos-${{ matrix.arch }}-${{ needs.compute-version.outputs.full }}",
    );
    expect(workflow).toContain("codesign --verify --deep --strict");
    expect(workflow).toContain("spctl --assess --type execute");
  });

  it("makes every packaged smoke job a release prerequisite", () => {
    const release = workflow.slice(workflow.indexOf("  release:"));
    expect(release).toContain("packaged-smoke-windows,");
    expect(release).toContain("packaged-smoke-macos,");
  });
});
