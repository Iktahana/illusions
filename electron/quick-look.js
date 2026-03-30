/* eslint-disable no-console */
// macOS Quick Look plugin installation

const { app } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const log = require("electron-log");

const execFileAsync = promisify(execFile);

async function installQuickLookPluginIfNeeded() {
  if (process.platform !== "darwin") {
    return;
  }

  if (!app.isPackaged) {
    return;
  }

  const markerPath = path.join(app.getPath("userData"), `quicklook-installed-${app.getVersion()}`);

  try {
    await fs.stat(markerPath);
    return;
  } catch {
    // インストール処理を続行
  }

  const sourcePath = path.join(
    process.resourcesPath,
    "Library",
    "QuickLook",
    "MDIQuickLook.qlgenerator",
  );

  try {
    await fs.stat(sourcePath);
  } catch (error) {
    log.warn("アプリリソース内に Quick Look プラグインが見つかりません:", error);
    return;
  }

  const destDir = path.join(os.homedir(), "Library", "QuickLook");
  const destPath = path.join(destDir, "MDIQuickLook.qlgenerator");

  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.rm(destPath, { recursive: true, force: true });
    await fs.cp(sourcePath, destPath, { recursive: true });
    await execFileAsync("/usr/bin/qlmanage", ["-r"]);
    await fs.writeFile(markerPath, new Date().toISOString());
    log.info("Quick Look プラグインをインストールしました");
  } catch (error) {
    log.warn("Quick Look のインストールに失敗しました:", error);
  }
}

module.exports = { installQuickLookPluginIfNeeded };
