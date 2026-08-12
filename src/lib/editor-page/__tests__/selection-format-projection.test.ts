import { beforeAll, describe, expect, it } from "vitest";

import { getDocumentAdapter } from "@/lib/document-format";
import { projectSelectionText } from "../use-selection-tracking";

beforeAll(async () => {
  await getDocumentAdapter("mdi").initialize();
});

describe("selection statistics document projection", () => {
  it.each([
    ["mdi", "{東京|とうきょう}", "東京"],
    ["markdown", "{東京|とうきょう}", "{東京|とうきょう}"],
    ["plain-text", "# literal heading", "# literal heading"],
  ] as const)("uses %s semantics", (format, source, expected) => {
    expect(projectSelectionText(source, format)).toBe(expected);
  });
});
