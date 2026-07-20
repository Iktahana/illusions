/**
 * Regression tests for issue #1884:
 * 印刷プレビューのページ番号・全角字下げが実際の印刷に反映されない
 *
 * Root causes fixed:
 * 1. `mdiToHtml` now accepts a `pageNumbers` option that embeds page numbers
 *    via CSS @page margin boxes — works for both printToPDF and webContents.print().
 * 2. The `file-ipc.js` printDocument handler now passes `fullwidthSpaceIndentCount`
 *    and `pageNumbers` to `mdiToHtml` (verified here via source-text assertions
 *    following the established pattern in file-ipc-print-window-leak.test.ts).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { mdiToHtml, getMdiStylesheet } from "../mdi-to-html";

const here = path.dirname(fileURLToPath(import.meta.url));
const fileIpcSource = readFileSync(
  path.resolve(here, "../../../../electron/ipc/file-ipc.js"),
  "utf-8",
);

// Narrow to the printDocument handler to avoid false positives from other handlers.
const printHandlerMatch = fileIpcSource.match(
  /ipcMain\.handle\(EXPORT_CHANNELS\.invoke\.printDocument[\s\S]*?(?=\n\s*ipcMain\.handle\()/,
);
const printHandler = printHandlerMatch ? printHandlerMatch[0] : "";

// ---------------------------------------------------------------------------
// CSS @page margin-box page numbers (getMdiStylesheet)
// ---------------------------------------------------------------------------

describe("getMdiStylesheet — CSS @page margin-box page numbers (#1884)", () => {
  it("emits no page number CSS when showPageNumbers is absent", () => {
    const css = getMdiStylesheet({ pageSize: "A5", landscape: false });
    expect(css).not.toContain("counter(page)");
    expect(css).not.toContain("@bottom");
    expect(css).not.toContain("@top");
  });

  it("emits simple counter for bottom-center (default position)", () => {
    const css = getMdiStylesheet({ showPageNumbers: true });
    expect(css).toContain("@bottom-center");
    expect(css).toContain("counter(page)");
  });

  it("emits dash format", () => {
    const css = getMdiStylesheet({
      showPageNumbers: true,
      pageNumberFormat: "dash",
      pageNumberPosition: "bottom-center",
    });
    expect(css).toContain('"- " counter(page) " -"');
  });

  it("emits fraction format with pages counter", () => {
    const css = getMdiStylesheet({
      showPageNumbers: true,
      pageNumberFormat: "fraction",
      pageNumberPosition: "bottom-right",
    });
    expect(css).toContain("@bottom-right");
    expect(css).toContain('counter(page) " / " counter(pages)');
  });

  it("maps all six positions to the correct CSS margin box", () => {
    const positions = [
      ["bottom-left", "@bottom-left"],
      ["bottom-center", "@bottom-center"],
      ["bottom-right", "@bottom-right"],
      ["top-left", "@top-left"],
      ["top-center", "@top-center"],
      ["top-right", "@top-right"],
    ] as const;

    for (const [position, expected] of positions) {
      const css = getMdiStylesheet({
        showPageNumbers: true,
        pageNumberPosition: position,
      });
      expect(css).toContain(expected);
    }
  });

  it("applies page size and margin alongside page numbers", () => {
    const css = getMdiStylesheet({
      pageSize: "A5",
      landscape: false,
      margins: { top: 20, bottom: 20, left: 15, right: 15 },
      showPageNumbers: true,
      pageNumberFormat: "simple",
      pageNumberPosition: "bottom-center",
    });
    // Both @page margin declaration and counter must be present
    expect(css).toContain("@page");
    expect(css).toContain("counter(page)");
    // Page size must still be set
    expect(css).toContain("size:");
  });
});

// ---------------------------------------------------------------------------
// mdiToHtml — pageNumbers option forwarded to stylesheet (#1884)
// ---------------------------------------------------------------------------

describe("mdiToHtml — pageNumbers option embeds CSS counters (#1884)", () => {
  it("embeds @page margin-box counter when pageNumbers.show is true", () => {
    const html = mdiToHtml("本文", {
      pageNumbers: { show: true, format: "simple", position: "bottom-center" },
    });
    expect(html).toContain("counter(page)");
    expect(html).toContain("@bottom-center");
  });

  it("does not embed counter when pageNumbers is absent", () => {
    const html = mdiToHtml("本文");
    expect(html).not.toContain("counter(page)");
  });

  it("does not embed counter when pageNumbers.show is false", () => {
    const html = mdiToHtml("本文", {
      pageNumbers: { show: false },
    });
    expect(html).not.toContain("counter(page)");
  });

  it("embeds counter in complete HTML document (not bodyOnly)", () => {
    const html = mdiToHtml("本文", {
      pageNumbers: { show: true, format: "dash", position: "top-right" },
    });
    // Should be a complete HTML doc with the counter in the <style> block
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("@top-right");
    expect(html).toContain('"- " counter(page) " -"');
  });

  it("bodyOnly mode ignores pageNumbers (no stylesheet emitted)", () => {
    // bodyOnly skips the <style> block entirely, so page numbers cannot be embedded
    const html = mdiToHtml("本文", {
      bodyOnly: true,
      pageNumbers: { show: true },
    });
    expect(html).not.toContain("counter(page)");
  });

  it("combines fullwidthSpaceIndentCount and pageNumbers correctly", () => {
    const html = mdiToHtml("本文\n\n二行目", {
      fullwidthSpaceIndentCount: 1,
      pageNumbers: { show: true, format: "simple", position: "bottom-center" },
    });
    // Full-width indent must be injected
    expect(html).toContain("<p>　本文</p>");
    // Page numbers must also be present
    expect(html).toContain("counter(page)");
  });
});

// ---------------------------------------------------------------------------
// file-ipc.js printDocument handler — source-text assertions (#1884)
// ---------------------------------------------------------------------------

describe("file-ipc.js printDocument handler — settings parity (#1884)", () => {
  it("printHandler section was found in source", () => {
    expect(printHandler.length).toBeGreaterThan(100);
  });

  it("imports fullwidthIndentCount from fullwidth-indent module", () => {
    expect(printHandler).toMatch(/require\(["'].*fullwidth-indent["']\)/);
    expect(printHandler).toMatch(/fullwidthIndentCount/);
  });

  it("computes fullwidthSpaceCount from opts.fullwidthSpaceIndent and opts.textIndent", () => {
    expect(printHandler).toMatch(/fullwidthSpaceCount/);
    expect(printHandler).toMatch(/opts\.fullwidthSpaceIndent/);
    expect(printHandler).toMatch(/opts\.textIndent/);
  });

  it("suppresses effectiveTextIndentEm when fullwidthSpaceIndent is on", () => {
    // When toggle is on, CSS text-indent must be 0 to avoid double indentation
    expect(printHandler).toMatch(/effectiveTextIndentEm/);
    // textIndentEm in typesetting must use the effective value (not raw textIndent)
    expect(printHandler).toMatch(/textIndentEm:\s*effectiveTextIndentEm/);
  });

  it("passes fullwidthSpaceIndentCount to mdiToHtml", () => {
    expect(printHandler).toMatch(/fullwidthSpaceIndentCount:\s*fullwidthSpaceCount/);
  });

  it("passes showPageNumbers to mdiToHtml as pageNumbers.show", () => {
    expect(printHandler).toMatch(/opts\.showPageNumbers/);
    expect(printHandler).toMatch(/pageNumbers:/);
    // The show field must reference opts.showPageNumbers
    expect(printHandler).toMatch(/show:\s*true/);
  });

  it("passes pageNumberFormat to mdiToHtml pageNumbers", () => {
    expect(printHandler).toMatch(/opts\.pageNumberFormat/);
    expect(printHandler).toMatch(/format:\s*opts\.pageNumberFormat/);
  });

  it("passes pageNumberPosition to mdiToHtml pageNumbers", () => {
    expect(printHandler).toMatch(/opts\.pageNumberPosition/);
    expect(printHandler).toMatch(/position:\s*opts\.pageNumberPosition/);
  });

  it("conditionally enables pageNumbers only when opts.showPageNumbers is truthy", () => {
    // pageNumbers must be undefined (not emitted) when showPageNumbers is off
    expect(printHandler).toMatch(/opts\.showPageNumbers\s*\?[\s\S]*?:\s*undefined/);
  });
});
