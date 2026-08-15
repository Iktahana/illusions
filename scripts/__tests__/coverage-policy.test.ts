import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const qualityWorkflowPath = path.join(process.cwd(), ".github/workflows/quality.yml");
const codecovPath = path.join(process.cwd(), "codecov.yml");
const coverageScriptPath = path.join(process.cwd(), "scripts/check-editor-coverage.mjs");

type CoverageMetric = { total: number; covered: number; skipped: number; pct: number };
type CoverageEntry = {
  statements: CoverageMetric;
  lines: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
};

function metric(pct: number): CoverageMetric {
  return { total: 10, covered: Math.round(pct / 10), skipped: 0, pct };
}

function entry(pct: number): CoverageEntry {
  return {
    statements: metric(pct),
    lines: metric(pct),
    functions: metric(pct),
    branches: metric(pct),
  };
}

async function runCoverageCheck(summary: Record<string, CoverageEntry | { total: number }>) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "editor-coverage-"));
  const summaryPath = path.join(tempRoot, "coverage-summary.json");
  await writeFile(summaryPath, JSON.stringify(summary), "utf8");
  try {
    return await execFileAsync("node", [coverageScriptPath, summaryPath], {
      cwd: process.cwd(),
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

describe("coverage policy", () => {
  it("uploads both lcov and JSON summary to Codecov from the quality workflow", async () => {
    const workflow = await readFile(qualityWorkflowPath, "utf8");
    expect(workflow).toContain("npm run test:coverage");
    expect(workflow).toContain("coverage/lcov.info,coverage/coverage-summary.json");
  });

  it("pins Codecov project and patch thresholds", async () => {
    const config = await readFile(codecovPath, "utf8");
    expect(config).toContain("threshold: 0.5%");
    expect(config).toContain("target: 85%");
  });

  it("fails when a required coverage target is missing from the summary", async () => {
    await expect(
      runCoverageCheck({
        total: { total: 1 },
        "/tmp/repo/src/components/Editor.tsx": entry(100),
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Missing coverage entry for src/lib/editor-interaction/**/*"),
    });
  });

  it("fails when a required file drops below the per-file threshold", async () => {
    await expect(
      runCoverageCheck({
        total: { total: 1 },
        "/tmp/repo/src/lib/editor-interaction/store.ts": {
          statements: metric(100),
          lines: metric(100),
          functions: metric(100),
          branches: metric(70),
        },
        "/tmp/repo/src/components/Editor.tsx": entry(100),
        "/tmp/repo/src/components/editor/MilkdownEditor.tsx": entry(100),
        "/tmp/repo/src/components/editor/EditorToolbar.tsx": entry(100),
        "/tmp/repo/src/components/editor/BubbleMenu.tsx": entry(100),
        "/tmp/repo/src/components/editor/ValuePicker.tsx": entry(100),
        "/tmp/repo/electron/lib/editor-command-registry.js": entry(100),
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("branches 70% < 75%"),
    });
  });

  it("passes when all required targets meet the thresholds", async () => {
    const result = await runCoverageCheck({
      total: { total: 1 },
      "/tmp/repo/src/lib/editor-interaction/store.ts": entry(100),
      "/tmp/repo/src/components/Editor.tsx": entry(100),
      "/tmp/repo/src/components/editor/MilkdownEditor.tsx": entry(100),
      "/tmp/repo/src/components/editor/EditorToolbar.tsx": entry(100),
      "/tmp/repo/src/components/editor/BubbleMenu.tsx": entry(100),
      "/tmp/repo/src/components/editor/ValuePicker.tsx": entry(100),
      "/tmp/repo/electron/lib/editor-command-registry.js": entry(100),
    });
    expect(result.stdout).toContain("Editor interaction per-file coverage thresholds passed.");
  });
});
