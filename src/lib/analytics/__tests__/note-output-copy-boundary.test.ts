import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function source(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("note output analytics copy boundary", () => {
  it("only instruments the formatted Note copy flow, never ordinary editor copy", () => {
    const formattedOutput = source("src/lib/export/use-export.ts");
    const editor = source("src/components/editor/MilkdownEditor.tsx");
    const webMenu = source("src/lib/menu/use-web-menu-handlers.ts");

    expect(formattedOutput).toContain("trackNoteOutputResult(operation, result)");
    expect(editor).toContain('document.execCommand("copy")');
    expect(editor).not.toContain("note_output_completed");
    expect(editor).not.toContain("trackNoteOutputResult");
    expect(webMenu).not.toContain("note_output_completed");
    expect(webMenu).not.toContain("trackNoteOutputResult");
  });
});
