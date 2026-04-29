import * as vscode from "vscode";

// Characters to strip before counting: markdown syntax, MDI macros, spaces
const STRIP_PATTERN =
  /```[\s\S]*?```|`[^`]+`|!\[.*?\]\(.*?\)|\[.*?\]\(.*?\)|^#{1,6}\s+|\*{1,3}|_{1,3}|~~|\[\[no-break:|[\]\]()]|\[\[kern:[^:]+:|^>\s*|<!--[\s\S]*?-->|\{([^|{}]+)\|[^}]+\}|\^([^^]+)\^|\s/g;

function countChars(text: string): number {
  // Replace MDI ruby with base text, TCY with content, strip everything else
  const stripped = text
    .replace(/\{([^|{}]+)\|[^}]+\}/g, "$1") // ruby → base text
    .replace(/\^([^^]+)\^/g, "$1") // tcy → content
    .replace(/\[\[no-break:([^\]]+)\]\]/g, "$1") // no-break → content
    .replace(/\[\[kern:[^:]+:([^\]]+)\]\]/g, "$1") // kern → content
    .replace(/```[\s\S]*?```/g, "") // fenced code blocks
    .replace(/`[^`]+`/g, "") // inline code
    .replace(/!\[.*?\]\(.*?\)/g, "") // images
    .replace(/\[.*?\]\(.*?\)/g, "") // links (keep title text is complex, skip)
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/\*{1,3}|_{1,3}|~~/g, "") // emphasis markers
    .replace(/^>\s*/gm, "") // blockquote markers
    .replace(/<!--[\s\S]*?-->/g, "") // html comments
    .replace(/^---[\s\S]*?---/m, "") // frontmatter
    .replace(/[ \t\r\n]/g, ""); // whitespace

  return stripped.length;
}

export class WordCountProvider {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = "illusions.openInIllusions";
    this.statusBarItem.tooltip = "illusions で開く";
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.statusBarItem,
      vscode.window.onDidChangeActiveTextEditor((editor) => this.update(editor)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (vscode.window.activeTextEditor?.document === e.document) {
          this.update(vscode.window.activeTextEditor);
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("illusions.showWordCount")) {
          this.update(vscode.window.activeTextEditor);
        }
      }),
    );

    this.update(vscode.window.activeTextEditor);
  }

  private update(editor: vscode.TextEditor | undefined): void {
    const config = vscode.workspace.getConfiguration("illusions");
    const show = config.get<boolean>("showWordCount", true);

    if (!show || !editor || !this.isMdiOrMarkdown(editor.document)) {
      this.statusBarItem.hide();
      return;
    }

    const text = editor.document.getText();
    const count = countChars(text);
    const target = config.get<number>("wordCountTarget", 0);

    if (target > 0) {
      const pct = Math.min(100, Math.round((count / target) * 100));
      this.statusBarItem.text = `$(book) ${count.toLocaleString()} 字 / ${target.toLocaleString()} 字 (${pct}%)`;
    } else {
      this.statusBarItem.text = `$(book) ${count.toLocaleString()} 字`;
    }

    this.statusBarItem.show();
  }

  private isMdiOrMarkdown(doc: vscode.TextDocument): boolean {
    return doc.languageId === "mdi" || doc.languageId === "markdown";
  }
}
