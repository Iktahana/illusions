import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../CreateProjectWindow.tsx"), "utf8");
const pageSource = readFileSync(path.resolve(here, "../../app/page.tsx"), "utf8");

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
});
