import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(__dirname, "../window-manager.js"), "utf8");

describe("E2E window visibility", () => {
  it("keeps Playwright windows hidden without changing normal ready-to-show behaviour", () => {
    expect(source).toContain('const IS_E2E = process.env.ILLUSIONS_E2E === "1"');
    expect(source).toMatch(
      /newWindow\.once\("ready-to-show",\s*\(\) => \{\s*if \(!IS_E2E\) newWindow\?\.show\(\);/,
    );
  });
});
