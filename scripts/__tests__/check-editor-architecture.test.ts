import { describe, expect, it } from "vitest";

import { checkEditorArchitecture } from "../check-editor-architecture.mjs";

describe("editor architecture release gate", () => {
  it("keeps the audited package and source ownership boundaries intact", () => {
    expect(checkEditorArchitecture()).toEqual([]);
  });
});
