import * as vscode from "vscode";
import { WordCountProvider } from "./wordCount";

export function activate(context: vscode.ExtensionContext): void {
  const wordCountProvider = new WordCountProvider();
  wordCountProvider.register(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("illusions.openInIllusions", openInIllusions),
    vscode.commands.registerCommand(
      "illusions.openProjectInIllusions",
      openProjectInIllusions,
    ),
  );
}

export function deactivate(): void {}

async function openInIllusions(uri?: vscode.Uri): Promise<void> {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri || targetUri.scheme !== "file") {
    vscode.window.showWarningMessage("illusions で開くにはファイルを選択してください。");
    return;
  }

  const url = buildOpenUrl(targetUri.fsPath);
  const opened = await vscode.env.openExternal(vscode.Uri.parse(url));
  if (!opened) {
    vscode.window.showErrorMessage(
      "illusions を開けませんでした。アプリがインストールされているか確認してください。",
    );
  }
}

async function openProjectInIllusions(uri?: vscode.Uri): Promise<void> {
  let targetPath: string | undefined;

  if (uri?.scheme === "file") {
    targetPath = uri.fsPath;
  } else {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      if (folders.length === 1) {
        targetPath = folders[0].uri.fsPath;
      } else {
        const picked = await vscode.window.showQuickPick(
          folders.map((f) => ({ label: f.name, detail: f.uri.fsPath, folder: f })),
          { placeHolder: "illusions で開くフォルダを選択" },
        );
        targetPath = picked?.folder.uri.fsPath;
      }
    }
  }

  if (!targetPath) {
    vscode.window.showWarningMessage("illusions で開くフォルダが見つかりません。");
    return;
  }

  const url = buildOpenUrl(targetPath);
  const opened = await vscode.env.openExternal(vscode.Uri.parse(url));
  if (!opened) {
    vscode.window.showErrorMessage(
      "illusions を開けませんでした。アプリがインストールされているか確認してください。",
    );
  }
}

function buildOpenUrl(fsPath: string): string {
  return `illusions://open?path=${encodeURIComponent(fsPath)}`;
}
