import { describe, expect, it } from "vitest";

import { getEditorSelectionSearchRange } from "@/lib/editor-page/use-selection-tracking";

describe("getEditorSelectionSearchRange", () => {
  it("tracks a moved selection even when its length is unchanged", () => {
    expect(getEditorSelectionSearchRange({ empty: false, from: 2, to: 5 })).toEqual({
      from: 2,
      to: 5,
    });
    expect(getEditorSelectionSearchRange({ empty: false, from: 8, to: 11 })).toEqual({
      from: 8,
      to: 11,
    });
  });

  it("uses the editor selection even after DOM focus leaves the editor", () => {
    expect(getEditorSelectionSearchRange({ empty: false, from: 4, to: 9 })).toEqual({
      from: 4,
      to: 9,
    });
    expect(getEditorSelectionSearchRange({ empty: true, from: 4, to: 4 })).toBeNull();
  });
});
