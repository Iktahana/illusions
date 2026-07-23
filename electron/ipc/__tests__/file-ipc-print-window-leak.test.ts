/**
 * Regression tests for the print BrowserWindow resource-leak fix (#1919).
 *
 * Root cause: the `printWin` variable was declared INSIDE the try block so the
 * catch path (print failure) had no reference to the hidden BrowserWindow, leaving
 * it alive. Repeated print failures accumulated invisible windows with their own
 * sessions and webContents.
 *
 * Fix: `printWin` is now declared as `let printWin = null` BEFORE the try block,
 * and a `finally` block calls `printWin.destroy()` when the window exists and has
 * not already been destroyed, covering the success, cancel, AND failure paths.
 *
 * file-ipc.js is a CommonJS Electron main-process module and cannot be imported
 * directly in vitest. These tests use source-text assertions to guard the invariant,
 * following the established pattern in file-ipc-size-validation.test.ts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../file-ipc.js"), "utf-8");

// Narrow to the printDocument handler to avoid false positives from other handlers.
// The handler starts at `ipcMain.handle(EXPORT_CHANNELS.invoke.printDocument` and
// ends before the next `ipcMain.handle(` call.
const printHandlerMatch = source.match(
  /ipcMain\.handle\(EXPORT_CHANNELS\.invoke\.printDocument[\s\S]*?(?=\n\s*ipcMain\.handle\()/,
);
const printHandler = printHandlerMatch ? printHandlerMatch[0] : "";

describe("file-ipc.js printDocument handler — BrowserWindow leak fix (#1919)", () => {
  it("printHandler section was found in source", () => {
    expect(printHandler.length).toBeGreaterThan(100);
  });

  it("printWin is declared with let before the try block (not const inside try)", () => {
    // The fix moves the declaration outside try: `let printWin = null;`
    expect(printHandler).toMatch(/let printWin\s*=\s*null/);
  });

  it("printWin is NOT declared with const inside the try block", () => {
    // Pre-fix: `const printWin = new BrowserWindow(...)` inside try
    expect(printHandler).not.toMatch(/const printWin\s*=/);
  });

  it("printWin is assigned via assignment (not declaration) inside try", () => {
    // Post-fix: `printWin = new BrowserWindow(...)` — no leading const/let
    expect(printHandler).toMatch(/^\s*printWin\s*=\s*new BrowserWindow\(/m);
  });

  it("has a finally block that guards destruction with isDestroyed()", () => {
    // The finally block must check isDestroyed() to avoid double-destroy
    expect(printHandler).toMatch(/finally\s*\{/);
    expect(printHandler).toMatch(/printWin\.isDestroyed\(\)/);
    expect(printHandler).toMatch(/printWin\.destroy\(\)/);
  });

  it("finally block guards against null printWin (pre-BrowserWindow-construction throw)", () => {
    // Guard: `if (printWin && !printWin.isDestroyed())` — printWin could still be null
    // if an exception was thrown before the BrowserWindow was constructed
    expect(printHandler).toMatch(/if\s*\(\s*printWin\s*&&\s*!printWin\.isDestroyed\(\)\s*\)/);
  });

  it("success path does NOT call printWin.destroy() (finally handles it)", () => {
    // The redundant success-path destroy was removed; finally covers all paths.
    // Extract only the try block body (before catch/finally) to check.
    const tryBodyMatch = printHandler.match(/\btry\s*\{([\s\S]*?)\}\s*catch\s*\(/);
    const tryBody = tryBodyMatch ? tryBodyMatch[1] : "";
    expect(tryBody).not.toMatch(/printWin\.destroy\(\)/);
  });

  it("uses the shared MDI Chromium profile adapter for system print", () => {
    expect(printHandler).toContain("preparePdfPrintDocument(content, opts)");
    expect(printHandler).toContain("electronSystemPrintHtml(prepared)");
    expect(printHandler).toContain("electronSystemPrintOptions(prepared)");
    expect(printHandler).toContain("loadPrintDocumentHtml(printWin, printHtml)");
    expect(printHandler).toContain("waitForPrintFonts(printWin.webContents)");
    expect(printHandler).not.toContain("data:text/html");
  });

  it("treats Electron's platform-specific cancellation reason as a normal cancel", () => {
    expect(printHandler).toContain("isPrintCancellationReason(failureReason)");
    expect(printHandler).not.toContain('failureReason === "cancelled"');
  });

  it("catch block does NOT call printWin.destroy() (finally handles it)", () => {
    const catchBodyMatch = printHandler.match(
      /\bcatch\s*\([^)]+\)\s*\{([\s\S]*?)\}\s*finally\s*\{/,
    );
    const catchBody = catchBodyMatch ? catchBodyMatch[1] : "";
    expect(catchBody).not.toMatch(/printWin\.destroy\(\)/);
  });
});
