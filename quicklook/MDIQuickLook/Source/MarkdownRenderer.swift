import Foundation

/// Renders MDI/Markdown source text into a self-contained HTML document for
/// Quick Look previews. macOS 12+ uses the native `AttributedString` Markdown
/// parser; older systems fall back to escaped plain text.
enum MarkdownRenderer {
  static func render(_ text: String) -> String {
    if #available(macOS 12.0, *) {
      do {
        let attributed = try AttributedString(
          markdown: text,
          options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )
        let nsAttributed = NSAttributedString(attributed)
        let data = try nsAttributed.data(
          from: NSRange(location: 0, length: nsAttributed.length),
          documentAttributes: [.documentType: NSAttributedString.DocumentType.html]
        )
        if let html = String(data: data, encoding: .utf8) {
          return wrapHTML(body: extractBody(from: html))
        }
        NSLog("[MDIQuickLook] Failed to decode HTML data.")
      } catch {
        NSLog("[MDIQuickLook] Markdown render failed: %@", String(describing: error))
      }
    } else {
      NSLog("[MDIQuickLook] Markdown rendering requires macOS 12+.")
    }

    return wrapHTML(body: "<pre>\(escapeHTML(text))</pre>")
  }

  private static func extractBody(from html: String) -> String {
    let pattern = "<body[^>]*>([\\s\\S]*?)</body>"
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
      return html
    }
    let range = NSRange(html.startIndex..<html.endIndex, in: html)
    guard let match = regex.firstMatch(in: html, options: [], range: range),
          match.numberOfRanges > 1,
          let bodyRange = Range(match.range(at: 1), in: html) else {
      return html
    }
    return String(html[bodyRange])
  }

  private static func wrapHTML(body: String) -> String {
    return """
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          :root { color-scheme: light dark; }
          body {
            margin: 24px;
            line-height: 1.7;
            font-size: 14px;
            font-family: -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif;
          }
          h1, h2, h3, h4, h5, h6 { margin: 1.2em 0 0.4em; line-height: 1.3; }
          p { margin: 0.6em 0; }
          ul, ol { padding-left: 1.4em; margin: 0.6em 0; }
          pre, code { background: rgba(127,127,127,0.15); border-radius: 6px; }
          pre {
            padding: 12px;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
          }
          code { padding: 0.1em 0.3em; }
          blockquote {
            margin: 0.8em 0;
            padding: 0 0.8em;
            border-left: 3px solid rgba(127,127,127,0.5);
          }
          hr { border: none; border-top: 1px solid rgba(127,127,127,0.3); margin: 1em 0; }
          table { border-collapse: collapse; margin: 0.6em 0; }
          th, td { border: 1px solid rgba(127,127,127,0.3); padding: 6px 8px; }
        </style>
      </head>
      <body>
        \(body)
      </body>
    </html>
    """
  }

  private static func escapeHTML(_ text: String) -> String {
    var result = text
    result = result.replacingOccurrences(of: "&", with: "&amp;")
    result = result.replacingOccurrences(of: "<", with: "&lt;")
    result = result.replacingOccurrences(of: ">", with: "&gt;")
    result = result.replacingOccurrences(of: "\"", with: "&quot;")
    return result
  }
}
