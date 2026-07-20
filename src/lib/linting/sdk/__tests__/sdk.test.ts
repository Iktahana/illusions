import { describe, it, expect } from "vitest";

import * as sdk from "../index";
import { ENGINE_API_VERSION, requirementKey } from "../ruleset-types";

describe("SDK public surface", () => {
  it("exports the engine version and base classes", () => {
    expect(ENGINE_API_VERSION).toBe(1);
    expect(typeof sdk.AbstractL1Rule).toBe("function");
    expect(typeof sdk.isMorphologicalLintRule).toBe("function");
  });

  it("builds a stable requirement key", () => {
    expect(requirementKey({ kind: "dict", dictId: "genji" })).toBe("dict:genji");
  });
});
