import Cocoa
import Quartz
import WebKit

/// Quick Look Preview Extension principal class for `.mdi` documents.
///
/// Modern macOS (Big Sur and later, especially Apple Silicon) no longer loads the
/// legacy `.qlgenerator` plug-ins. Previews must be provided by a Quick Look
/// Preview Extension (`.appex`) whose principal class conforms to
/// `QLPreviewingController`. This class renders the MDI/Markdown source into HTML
/// and displays it in a `WKWebView`.
final class PreviewViewController: NSViewController, QLPreviewingController {
  private let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())

  override func loadView() {
    webView.setValue(false, forKey: "drawsBackground")
    self.view = webView
  }

  func preparePreviewOfFile(
    at url: URL,
    completionHandler handler: @escaping (Error?) -> Void
  ) {
    let text: String
    do {
      text = try String(contentsOf: url, encoding: .utf8)
    } catch {
      NSLog("[MDIQuickLook] Failed to read file: %@", String(describing: error))
      handler(error)
      return
    }

    let html = MarkdownRenderer.render(text)
    webView.loadHTMLString(html, baseURL: nil)
    handler(nil)
  }
}
