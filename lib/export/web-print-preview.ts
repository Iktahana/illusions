import { mdiToHtml } from "./mdi-to-html";
import { calculateTypesetting } from "./pdf-export-settings";

import type { ExportMetadata } from "./types";
import type { PdfExportSettings } from "./pdf-export-settings";

/**
 * Open browser's native print preview in a new window.
 *
 * `window.open()` is called synchronously (before any `await`) to avoid
 * popup blockers. Callers MUST statically import this module — dynamic
 * `await import(...)` before calling this function will break the gesture.
 *
 * Returns `true` when print preview was successfully opened and `print()`
 * called. Returns `false` only if popup was blocked.
 *
 * "Success" means the print preview window opened — it does NOT mean
 * the user saved/printed. Browser print preview gives no save/cancel signal.
 */
export async function openWebPrintPreview(
  content: string,
  metadata: ExportMetadata,
  settings: PdfExportSettings,
): Promise<boolean> {
  // MUST be the first statement — synchronous, within user gesture
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  printWindow.document.write(
    '<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#666"><p>読み込み中…</p></body></html>',
  );

  try {
    const { fontSizeMm, lineHeightRatio } = calculateTypesetting(
      settings.pageSize,
      settings.margins,
      settings.charsPerLine,
      settings.linesPerPage,
      settings.verticalWriting,
      settings.landscape,
    );
    const html = mdiToHtml(content, {
      metadata,
      verticalWriting: settings.verticalWriting,
      typesetting: {
        fontFamily: settings.fontFamily, // Already a CSS string — no reverse lookup
        fontSizeMm,
        lineHeightRatio,
        textIndentEm: settings.textIndent,
        margins: settings.margins,
        pageSize: settings.pageSize,
        landscape: settings.landscape,
      },
    });

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    // Close the popup after printing (or when the user cancels).
    // Safari < 17 does not fire "afterprint", so fall back to "focus" on opener.
    let closed = false;
    const closeOnce = (): void => {
      if (!closed) {
        closed = true;
        printWindow.close();
      }
    };
    printWindow.addEventListener("afterprint", closeOnce);
    window.addEventListener("focus", closeOnce, { once: true });
    printWindow.print();
    return true;
  } catch (error) {
    printWindow.close();
    throw error;
  }
}
