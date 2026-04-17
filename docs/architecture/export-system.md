---
title: エクスポートシステム
slug: export-system
type: architecture
status: active
updated: 2026-06-10
tags:
  - architecture
  - mdi
  - export
---

# Export System Documentation

Modular MDI export pipeline supporting 5 output formats with secure HTML rendering, Electron IPC integration, and browser-native download fallback.

---

## Overview

The export system converts MDI (Markdown for Illusions) content into multiple output formats. It provides a unified React hook API (`useExport`) that handles client-side exports (TXT, TXT+Ruby), browser-native exports (EPUB, DOCX via blob download), and Electron IPC-based exports (PDF, EPUB, DOCX).

### Supported Formats

| Format   | Engine                | Environment            | Description                                   |
| -------- | --------------------- | ---------------------- | --------------------------------------------- |
| PDF      | Electron `printToPDF` | Electron only          | Hidden BrowserWindow rendering                |
| EPUB 3   | `archiver` / `fflate` | Electron + Web browser | Electron: IPC save dialog; Web: blob download |
| DOCX     | `docx` library        | Electron + Web browser | Electron: IPC save dialog; Web: blob download |
| TXT      | Built-in              | Client + Electron      | Plain text, all MDI syntax stripped           |
| TXT+Ruby | Built-in              | Client + Electron      | Plain text with ruby in parentheses           |

### Key Files

| File                           | Purpose                                                                     |
| ------------------------------ | --------------------------------------------------------------------------- |
| `lib/export/types.ts`          | Type definitions for the export system                                      |
| `lib/export/use-export.ts`     | React hook providing the `exportAs` API                                     |
| `lib/export/mdi-to-html.ts`    | MDI-to-HTML conversion pipeline                                             |
| `lib/export/pdf-exporter.ts`   | PDF export via hidden BrowserWindow (Electron)                              |
| `lib/export/epub-exporter.ts`  | EPUB 3.0 archive generation (Electron, uses `archiver`)                     |
| `lib/export/epub-web.ts`       | EPUB 3.0 export for browser environments (uses `fflate` ZIP library)        |
| `lib/export/epub-shared.ts`    | Shared EPUB template generators (Node.js + browser compatible)              |
| `lib/export/docx-exporter.ts`  | DOCX document generation (Electron + Web)                                   |
| `lib/export/txt-exporter.ts`   | TXT and TXT+Ruby export                                                     |
| `lib/export/save-blob-file.ts` | Blob save helper: tries File System Access API, falls back to blob download |

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│              React Component                                 │
│              useExport({ getContent, getTitle })             │
│              └── exportAs(format)                            │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┴───────────────────┐
          │                              │
     Client-side           ┌─────────────┴────────────┐
     (TXT, TXT+Ruby)       │                          │
          │            Web browser             Electron IPC
          ▼          (EPUB, DOCX via         (PDF, EPUB, DOCX)
   ┌──────────────┐    blob download)               │
   │ txt-exporter │         │                        ▼
   │              │         ▼            ┌──────────────────────────────────────┐
   │ Strip MDI    │  ┌──────────────┐    │ Electron Main Process                │
   │ syntax       │  │ epub-web.ts  │    │                                      │
   │ + optional   │  │ (fflate ZIP) │    │  ┌────────────────────────────────┐  │
   │ ruby in ()   │  │              │    │  │ mdi-to-html.ts                 │  │
   │              │  │ docx-        │    │  │ MDI → PUA placeholders         │  │
   └──────────────┘  │ exporter.ts  │    │  │ → markdown-it (html:false)     │  │
                     └──────┬───────┘    │  │ → restore safe HTML             │  │
                            │            │  └──────────┬─────────────────────┘  │
                     saveBlobFile()      │             │                         │
                     (File System        │    ┌────────┴────────┐               │
                     Access API or       │    │                 │               │
                     blob download)      │    ▼                 ▼               │
                                         │  ┌──────────┐  ┌──────────────┐     │
                                         │  │ PDF      │  │ EPUB / DOCX  │     │
                                         │  │ Hidden   │  │ archiver /   │     │
                                         │  │ Browser  │  │ docx lib     │     │
                                         │  │ Window   │  │              │     │
                                         │  └──────────┘  └──────────────┘     │
                                         │                                      │
                                         │  dialog.showSaveDialog → write file  │
                                         └──────────────────────────────────────┘
```

### MDI-to-HTML Pipeline (`mdi-to-html.ts`)

The conversion pipeline ensures security by never passing raw MDI syntax through markdown-it's HTML renderer:

1. **Pre-process**: Scan MDI syntax and replace with Unicode Private Use Area (PUA) placeholders
2. **Render**: Pass through `markdown-it` with `html: false` (security: prevents XSS)
3. **Restore**: Replace PUA placeholders with safe, pre-sanitized HTML

#### Supported MDI Syntax

| Syntax                 | Description                            | HTML Output                                          |
| ---------------------- | -------------------------------------- | ---------------------------------------------------- |
| `{base\|ruby}`         | Ruby annotation                        | `<ruby>base<rp>(</rp><rt>ruby</rt><rp>)</rp></ruby>` |
| `^tcy^`                | Tate-chu-yoko (horizontal-in-vertical) | `<span class="tcy">tcy</span>`                       |
| `[[no-break:text]]`    | Non-breaking text                      | `<span class="no-break">text</span>`                 |
| `[[kern:amount:text]]` | Manual kerning                         | `<span style="letter-spacing:amount">text</span>`    |

#### Security Model

- **CSP meta tag** injected into rendered HTML
- **`markdown-it` configured with `html: false`** to prevent raw HTML injection
- **Placeholder approach** ensures MDI-specific HTML is generated safely (not user-supplied)

---

## Key Interfaces and Types

```typescript
/** Supported export formats */
type ExportFormat = "pdf" | "epub" | "docx" | "txt" | "txt-ruby";

/** Metadata attached to exported documents */
interface ExportMetadata {
  title: string;
  author?: string;
  date?: string;
  language?: string;
}

/** A chapter unit for multi-chapter exports (EPUB, DOCX) */
interface Chapter {
  title: string;
  htmlContent: string;
  level: number; // Heading level (1-6)
}

/** Hook input configuration */
interface UseExportOptions {
  getContent: () => string; // Returns current MDI content
  getTitle: () => string; // Returns document title
}

/** Hook return value */
interface UseExportReturn {
  exportAs: (format: ExportFormat) => Promise<void>;
}
```

---

## Code Examples

### Basic Usage with `useExport` Hook

```typescript
import { useExport } from "@/lib/export/use-export";

function ExportButton() {
  const { exportAs } = useExport({
    getContent: () => editorRef.current?.getContent() ?? "",
    getTitle: () => currentFileName ?? "Untitled",
  });

  const handleExportPDF = async () => {
    await exportAs("pdf");
  };

  const handleExportEPUB = async () => {
    await exportAs("epub");
  };

  return (
    <>
      <button onClick={handleExportPDF}>PDF出力</button>
      <button onClick={handleExportEPUB}>EPUB出力</button>
    </>
  );
}
```

### Export Format Details

#### PDF Export

Uses a hidden `BrowserWindow` in the Electron main process:

```typescript
// Main process (simplified)
const win = new BrowserWindow({
  show: false,
  webPreferences: {
    offscreen: true,
    sandbox: true,
  },
});

// Load rendered HTML via data: URL
await win.loadURL(`data:text/html;charset=utf-8,${encodedHtml}`);

// Strict CSP enforced via session headers
win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      "Content-Security-Policy": ["default-src 'none'; style-src 'unsafe-inline'"],
    },
  });
});

// Generate PDF
const pdfBuffer = await win.webContents.printToPDF({
  pageSize: "A5", // Supported: A4, A5, B5, B6
  printBackground: true,
});
```

#### EPUB 3 Export

Generates a standards-compliant EPUB 3.0 archive:

```
output.epub (ZIP archive)
├── mimetype                    (uncompressed, must be first entry)
├── META-INF/
│   └── container.xml
└── OEBPS/
    ├── content.opf             (package document)
    ├── toc.xhtml               (navigation document)
    ├── style.css               (embedded stylesheet)
    ├── chapter-001.xhtml       (content split by # headings)
    ├── chapter-002.xhtml
    └── ...
```

Content is split into chapters at `#` heading boundaries.

- **Electron**: `epub-exporter.ts` uses the `archiver` library; the archive is written to the path chosen via `dialog.showSaveDialog`.
- **Web browser**: `epub-web.ts` uses the `fflate` library to produce a `Blob`, which is saved via `saveBlobFile()` (File System Access API → Blob URL download fallback).

#### DOCX Export

```typescript
// DOCX configuration
const docxConfig = {
  font: "Yu Mincho", // 游明朝
  fontSize: 12, // 12pt
  pageSize: "A5",
  margins: {
    top: 20, // 20mm all sides
    bottom: 20,
    left: 20,
    right: 20,
  },
};

// Ruby fallback: {漢字|かんじ} → 漢字（かんじ）
// DOCX does not support <ruby> tags, so ruby text is rendered
// as fullwidth parentheses after the base text.
```

#### TXT and TXT+Ruby Export

```typescript
// TXT: Strip all MDI syntax and markdown formatting.
// Blank lines between paragraphs are removed from the output.
// Input:  "{漢字|かんじ}を使った^12^月の文章"
// Output: "漢字を使った12月の文章"

// TXT+Ruby: Keep ruby annotations in parentheses.
// Blank lines between paragraphs are removed from the output.
// Input:  "{漢字|かんじ}を使った^12^月の文章"
// Output: "漢字（かんじ）を使った12月の文章"
```

### IPC Channels

| Channel       | Direction       | Description                                   |
| ------------- | --------------- | --------------------------------------------- |
| `export-pdf`  | Renderer → Main | Trigger PDF export with content and metadata  |
| `export-epub` | Renderer → Main | Trigger EPUB export with content and metadata |
| `export-docx` | Renderer → Main | Trigger DOCX export with content and metadata |

In Electron mode, all IPC handlers call `dialog.showSaveDialog` in the main process to let the user choose the output path.

In web browser mode, EPUB and DOCX are exported entirely client-side: the exporter generates a `Blob`, which `saveBlobFile()` saves via the File System Access API (`showSaveFilePicker`) when available, or falls back to a Blob URL `<a download>` trigger for unsupported browsers or when the user gesture has expired.

---

## Related Documentation

- [Storage System](./storage-system.md) -- Persistence layer used for export preferences
- [NLP Backend Architecture](./nlp-backend-architecture.md) -- Text processing backend
- [MDI Syntax Specification](../MDI/spec.md) -- Full MDI syntax reference

---

**Last Updated**: 2026-06-10
**Version**: 1.1.0
