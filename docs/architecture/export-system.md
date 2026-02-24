# Export System Documentation

Modular MDI export pipeline supporting 5 output formats with secure HTML rendering and Electron IPC integration.

---

## Overview

The export system converts MDI (Markdown for Illusions) content into multiple output formats. It provides a unified React hook API (`useExport`) that handles both client-side exports (TXT, TXT+Ruby) and Electron IPC-based exports (PDF, EPUB, DOCX).

### Supported Formats

| Format | Engine | Environment | Description |
|--------|--------|-------------|-------------|
| PDF | Electron `printToPDF` | Electron only | Hidden BrowserWindow rendering |
| EPUB 3 | `archiver` | Electron only | Standards-compliant EPUB 3.0 |
| DOCX | `docx` library | Electron only | Microsoft Word format |
| TXT | Built-in | Client + Electron | Plain text, all MDI syntax stripped |
| TXT+Ruby | Built-in | Client + Electron | Plain text with ruby in parentheses |

### Key Files

| File | Purpose |
|------|---------|
| `lib/export/types.ts` | Type definitions for the export system |
| `lib/export/use-export.ts` | React hook providing the `exportAs` API |
| `lib/export/mdi-to-html.ts` | MDI-to-HTML conversion pipeline |
| `lib/export/pdf-exporter.ts` | PDF export via hidden BrowserWindow |
| `lib/export/epub-exporter.ts` | EPUB 3.0 archive generation |
| `lib/export/docx-exporter.ts` | DOCX document generation |
| `lib/export/txt-exporter.ts` | TXT and TXT+Ruby export |

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
          ┌──────────┴──────────┐
          │                     │
     Client-side           Electron IPC
     (TXT, TXT+Ruby)      (PDF, EPUB, DOCX)
          │                     │
          ▼                     ▼
   ┌──────────────┐   ┌──────────────────────────────────────┐
   │ txt-exporter │   │ Electron Main Process                │
   │              │   │                                      │
   │ Strip MDI    │   │  ┌────────────────────────────────┐  │
   │ syntax       │   │  │ mdi-to-html.ts                 │  │
   │ + optional   │   │  │ MDI → PUA placeholders         │  │
   │ ruby in ()   │   │  │ → markdown-it (html:false)     │  │
   │              │   │  │ → restore safe HTML             │  │
   └──────────────┘   │  └──────────┬─────────────────────┘  │
                      │             │                         │
                      │    ┌────────┴────────┐               │
                      │    │                 │               │
                      │    ▼                 ▼               │
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

| Syntax | Description | HTML Output |
|--------|-------------|-------------|
| `{base\|ruby}` | Ruby annotation | `<ruby>base<rp>(</rp><rt>ruby</rt><rp>)</rp></ruby>` |
| `^tcy^` | Tate-chu-yoko (horizontal-in-vertical) | `<span class="tcy">tcy</span>` |
| `[[no-break:text]]` | Non-breaking text | `<span class="no-break">text</span>` |
| `[[kern:amount:text]]` | Manual kerning | `<span style="letter-spacing:amount">text</span>` |

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
  getContent: () => string;   // Returns current MDI content
  getTitle: () => string;     // Returns document title
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

#### DOCX Export

```typescript
// DOCX configuration
const docxConfig = {
  font: "Yu Mincho",       // 游明朝
  fontSize: 12,            // 12pt
  pageSize: "A5",
  margins: {
    top: 20,               // 20mm all sides
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
// TXT: Strip all MDI syntax and markdown formatting
// Input:  "{漢字|かんじ}を使った^12^月の文章"
// Output: "漢字を使った12月の文章"

// TXT+Ruby: Keep ruby annotations in parentheses
// Input:  "{漢字|かんじ}を使った^12^月の文章"
// Output: "漢字（かんじ）を使った12月の文章"
```

### IPC Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `export-pdf` | Renderer → Main | Trigger PDF export with content and metadata |
| `export-epub` | Renderer → Main | Trigger EPUB export with content and metadata |
| `export-docx` | Renderer → Main | Trigger DOCX export with content and metadata |

All IPC handlers call `dialog.showSaveDialog` in the main process to let the user choose the output path.

---

## Related Documentation

- [Storage System](./storage-system.md) -- Persistence layer used for export preferences
- [NLP Backend Architecture](./nlp-backend-architecture.md) -- Text processing backend
- [MDI Syntax Specification](../../MDI.md) -- Full MDI syntax reference

---

**Last Updated**: 2026-02-25
**Version**: 1.0.0
