import { writeFile } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "./fixtures/electron";

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

async function selectEditorText(page: import("@playwright/test").Page): Promise<void> {
  await page
    .locator(".ProseMirror")
    .last()
    .evaluate((editor) => {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
}

async function selectFirstEditorCharacters(
  page: import("@playwright/test").Page,
  count: number,
): Promise<void> {
  const editor = page.locator(".ProseMirror").last();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
  await page.keyboard.down("Shift");
  for (let index = 0; index < count; index++) await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
}

async function openStatsPanel(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: /^統計(?:\s|$)/ }).click();
  await expect(page.getByRole("heading", { name: "全体の統計" })).toBeVisible();
}

test("toolbar and bubble menu format the current MDI selection", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "format.mdi");
  await writeFile(filePath, "書式を適用する本文", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const editor = mainWindow.locator(".ProseMirror").last();
  await replaceEditorText(mainWindow, "書式を適用する本文");
  await expect(mainWindow.getByRole("toolbar", { name: "エディター表示" })).toBeVisible();

  await selectEditorText(mainWindow);
  const bubble = mainWindow.getByRole("toolbar", { name: "選択範囲の書式" });
  await expect(bubble).toBeVisible();
  await bubble.getByRole("button", { name: "太字" }).click();
  await expect(editor.locator("strong")).toContainText("書式を適用する本文");

  await editor.click();
  await expect(bubble).toBeHidden();
});

test("TCY stays canonical across bubble menu, save, and reopen", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "tcy.mdi");
  await writeFile(filePath, "12月", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const editor = mainWindow.locator(".ProseMirror").last();

  await selectFirstEditorCharacters(mainWindow, 2);
  const bubble = mainWindow.getByRole("toolbar", { name: "選択範囲の書式" });
  await expect(bubble).toBeVisible();
  await bubble.getByRole("button", { name: "縦中横を切替" }).click();
  await expect(editor.locator(".mdi-tcy")).toContainText("12");
  await expect(mainWindow).toHaveTitle(/\*/);

  await nativeHarness.queueSavePath(filePath);
  await nativeHarness.saveAs();
  await expect.poll(() => nativeHarness.readSavedFile(filePath)).toBe("^12^月\n");
  await nativeHarness.closeTab();
  await nativeHarness.queueOpenPaths([filePath]);
  await nativeHarness.open();
  await expect(mainWindow.locator(".ProseMirror").last().locator(".mdi-tcy")).toContainText("12");
});

test("plain text does not expose the formatting bubble", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "plain.txt");
  await writeFile(filePath, "plain text only", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await expect(mainWindow.locator(".ProseMirror")).toContainText("plain text only");
  await selectEditorText(mainWindow);
  await expect(mainWindow.getByRole("toolbar", { name: "選択範囲の書式" })).toBeHidden();
});

test("selection statistics follow the active editor selection", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "selection-stats.mdi");
  await writeFile(filePath, "一二\n三四", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();

  await openStatsPanel(mainWindow);
  await expect(mainWindow.getByRole("heading", { name: "全体の統計" })).toBeVisible();

  await selectEditorText(mainWindow);
  const statsPanel = mainWindow.locator(".stats-panel");
  await expect(mainWindow.getByRole("heading", { name: "選択範囲の分析" })).toBeVisible();
  await expect(statsPanel).toContainText("選択中");
  await expect(statsPanel).toContainText("40マス");
  await expect(statsPanel).toContainText("1枚");

  await mainWindow.locator(".ProseMirror").last().click();
  await expect(mainWindow.getByRole("heading", { name: "全体の統計" })).toBeVisible();
});

test("editor context menu crosses renderer, preload, IPC, and native role", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "context.mdi");
  await writeFile(filePath, "first", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const editor = mainWindow.locator(".ProseMirror").last();
  await replaceEditorText(mainWindow, "first");
  await editor.pressSequentially(" second");
  await nativeHarness.selectContextCommand("edit.undo");
  await editor.click({ button: "right" });
  await expect(editor).toHaveText("first");

  const menus = await nativeHarness.takeContextMenus();
  const editorMenu = menus.at(-1) ?? [];
  expect(editorMenu.map((item) => item.role)).toEqual([
    "undo",
    "redo",
    undefined,
    "cut",
    "copy",
    "paste",
    undefined,
    "selectAll",
    undefined,
  ]);
});

test("renderer-owned TCY command survives the native context-menu round-trip", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "context-tcy.mdi");
  await writeFile(filePath, "12月", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const editor = mainWindow.locator(".ProseMirror").last();

  await selectFirstEditorCharacters(mainWindow, 2);

  await nativeHarness.selectContextCommand("format.tcy");
  await editor.evaluate((element) => {
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
      }),
    );
  });
  await expect(editor.locator(".mdi-tcy")).toContainText("12");
});
