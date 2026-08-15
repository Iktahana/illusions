import { test, expect } from "./fixtures/electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function replaceEditorText(
  page: import("@playwright/test").Page,
  text: string,
): Promise<void> {
  const editor = page.locator(".ProseMirror").last();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text);
}

test("@smoke launches, edits, saves, reopens, toggles writing mode, and closes cleanly", async ({
  electronApp,
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  await expect(mainWindow.locator("body")).toBeVisible();
  expect(electronApp.windows().length).toBeGreaterThan(0);

  const source = path.join(workerRoot, "projects", "source.mdi");
  const target = path.join(workerRoot, "exports", "packaged-smoke.mdi");
  await writeFile(source, "起動確認", "utf8");
  await nativeHarness.queueOpenPaths([source]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const editor = mainWindow.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  await replaceEditorText(mainWindow, "packaged smoke 原稿");
  await expect(editor).toContainText("packaged smoke 原稿");
  await expect(mainWindow).toHaveTitle(/\*/);

  const toggle = mainWindow.getByRole("button", { name: "縦書きに切り替え" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(mainWindow.getByRole("button", { name: "横書きに切り替え" })).toBeVisible();

  await nativeHarness.queueSavePath(target);
  await nativeHarness.saveAs();
  await expect
    .poll(async () => readFile(target, "utf8").catch(() => ""))
    .toContain("packaged smoke 原稿");

  await nativeHarness.queueOpenPaths([target]);
  await nativeHarness.open();
  await expect(mainWindow.locator(".ProseMirror").last()).toContainText("packaged smoke 原稿");
});
