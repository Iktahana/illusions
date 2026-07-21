import { describe, expect, it } from "vitest";
import { renderHtmlWithDiagnostics } from "@illusions-lab/mdi";
import { resolvePrintProfile } from "@illusions-lab/mdi-export-profile";

import { exportMdiText } from "../txt-exporter";
import { normalizeExportSource, toExportProfile } from "../mdi-export";
import { DEFAULT_EXPORT_SETTINGS } from "../export-settings";

const source = "# 見出し\n\n{漢字|かんじ}と^12^月。\n\n[[blank]]\n\n次。";

describe("@illusions-lab/mdi export boundary", () => {
  it.each(["txt", "txt-ruby", "narou", "kakuyomu", "aozora"] as const)(
    "renders the upstream %s text format",
    (format) => {
      expect(exportMdiText(source, format)).toContain("見出し");
    },
  );

  it("retains Rust diagnostics and headings for HTML consumers", () => {
    const result = renderHtmlWithDiagnostics(normalizeExportSource(source), { bodyOnly: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.headings).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "見出し" })]),
    );
    expect(result.output).toContain('<ruby class="mdi-ruby">');
  });

  it("uses the upstream japanese-publisher defaults", () => {
    const profile = toExportProfile(DEFAULT_EXPORT_SETTINGS, { title: "テスト", language: "ja" });
    const resolved = resolvePrintProfile(profile, "vertical");
    expect(resolved.layout.system).toBe("japanese-publisher");
    expect(resolved.pagination.pageSize).toBeDefined();
  });
});
