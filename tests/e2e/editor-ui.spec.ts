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

async function selectFirstOccurrence(
  page: import("@playwright/test").Page,
  text: string,
): Promise<void> {
  await page
    .locator(".ProseMirror")
    .last()
    .evaluate((editor, searchText) => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const value = node.textContent ?? "";
        const start = value.indexOf(searchText);
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + searchText.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        editor.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        return;
      }
      throw new Error(`Could not find text: ${searchText}`);
    }, text);
}

async function openStatsPanel(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: /^統計(?:\s|$)/ }).click();
  await expect(page.getByRole("heading", { name: "全体の統計" })).toBeVisible();
}

async function openCorrectionsPanel(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: /^校正(?:\s|$)/ }).click();
  await expect(page.getByRole("heading", { name: "品詞ハイライト" })).toBeVisible();
}

async function dismissStartupPrompts(page: import("@playwright/test").Page): Promise<void> {
  const maybeDismiss = async (label: string) => {
    const button = page.getByRole("button", { name: label, exact: true });
    if (await button.isVisible().catch(() => false)) await button.click();
  };
  await maybeDismiss("今はしない");
  await maybeDismiss("OK");
  await maybeDismiss("閉じる");
}

async function setPosHighlightEnabled(
  page: import("@playwright/test").Page,
  enabled: boolean,
): Promise<void> {
  await openCorrectionsPanel(page);
  const heading = page.getByRole("heading", { name: "品詞ハイライト" });
  const section = heading.locator("..").locator("..").locator("..");
  const toggle = heading.locator("..").locator("..").locator("button");
  const legend = section.getByText("名詞", { exact: true });
  const hasLegend = async () => (await legend.count()) > 0;
  const isEnabled = await hasLegend();
  if (isEnabled !== enabled) await toggle.click();
  if (enabled) await expect(legend).toBeVisible();
  else await expect(legend).toBeHidden();
}

function visibleEditor(page: import("@playwright/test").Page) {
  return page.locator(".ProseMirror:visible").last();
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

test("Ruby stays canonical across bubble menu, save, and reopen", async ({
  electronApp,
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "ruby.mdi");
  await writeFile(filePath, "漢字\n", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();

  await selectFirstEditorCharacters(mainWindow, 2);
  const bubble = mainWindow.getByRole("toolbar", { name: "選択範囲の書式" });
  await expect(bubble).toBeVisible();
  const rubyWindowPromise = electronApp.waitForEvent("window");
  await bubble.getByRole("button", { name: "ルビを設定" }).click();
  const rubyWindow = await rubyWindowPromise;
  await rubyWindow.waitForLoadState("domcontentloaded");
  await expect(rubyWindow.getByRole("dialog", { name: "ルビ設定" })).toBeVisible();
  const reading = rubyWindow.getByPlaceholder("読み");
  await reading.fill("かんじ");
  await rubyWindow.getByRole("button", { name: "適用" }).click();
  await expect
    .poll(() => electronApp.windows().some((page) => page.url().includes("ruby-dialog")))
    .toBe(false);
  await expect(mainWindow.locator(".ProseMirror").last().locator("ruby.mdi-ruby rt")).toHaveText(
    "かんじ",
  );
  await expect(mainWindow).toHaveTitle(/\*/);

  await nativeHarness.queueSavePath(filePath);
  await nativeHarness.saveAs();
  await expect.poll(() => nativeHarness.readSavedFile(filePath)).toBe("{漢字|かんじ}\n");
  await nativeHarness.closeTab();
  await nativeHarness.queueOpenPaths([filePath]);
  await nativeHarness.open();
  await expect(mainWindow.locator(".ProseMirror").last().locator("ruby.mdi-ruby rt")).toHaveText(
    "かんじ",
  );
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
  expect(editorMenu.map((item) => item.command ?? item.role ?? item.type)).toEqual([
    "undo",
    "redo",
    "separator",
    "cut",
    "copy",
    "paste",
    "separator",
    "selectAll",
    "separator",
    "format.ruby",
    "separator",
    "format.tcy",
    "speech.toggle",
    "speech.stop",
  ]);
});

test("renderer-owned Ruby command survives the native context-menu round-trip", async ({
  electronApp,
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "context-ruby.mdi");
  await writeFile(filePath, "漢字\n", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const editor = mainWindow.locator(".ProseMirror").last();

  await selectFirstEditorCharacters(mainWindow, 2);
  await nativeHarness.selectContextCommand("format.ruby");
  const rubyWindowPromise = electronApp.waitForEvent("window");
  await editor.evaluate((element) => {
    element.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
    );
  });
  const rubyWindow = await rubyWindowPromise;
  await rubyWindow.waitForLoadState("domcontentloaded");
  await expect(rubyWindow.getByRole("dialog", { name: "ルビ設定" })).toBeVisible();
  const reading = rubyWindow.getByPlaceholder("読み");
  await reading.fill("かんじ");
  await rubyWindow.getByRole("button", { name: "適用" }).click();
  await expect
    .poll(() => electronApp.windows().some((page) => page.url().includes("ruby-dialog")))
    .toBe(false);
  await expect(mainWindow).toHaveTitle(/\*/);

  await nativeHarness.queueSavePath(filePath);
  await nativeHarness.saveAs();
  await expect.poll(() => nativeHarness.readSavedFile(filePath)).toBe("{漢字|かんじ}\n");
});

test("speech follows the active selection and cleans up on tab change", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  await mainWindow.addInitScript(() => {
    Object.assign(window as Window & { __speechDebug?: Record<string, number> }, {
      __speechDebug: {
        speakCalls: 0,
        startCalls: 0,
        boundaryCalls: 0,
        menuEvents: 0,
      },
    });
    class MockUtterance {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      voice = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onpause: (() => void) | null = null;
      onresume: (() => void) | null = null;
      onboundary: ((event: { charIndex: number; charLength: number }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const queue: MockUtterance[] = [];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: MockUtterance });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        cancel: () => queue.splice(0),
        pause: () => queue.at(0)?.onpause?.(),
        resume: () => queue.at(0)?.onresume?.(),
        speak: (utterance: MockUtterance) => {
          window.__speechDebug!.speakCalls += 1;
          queue.push(utterance);
          window.__speechDebug!.startCalls += 1;
          utterance.onstart?.();
          window.__speechDebug!.boundaryCalls += 1;
          utterance.onboundary?.({ charIndex: 0, charLength: Math.max(1, utterance.text.length) });
        },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });
  await mainWindow.reload();
  await mainWindow.waitForLoadState("domcontentloaded");
  await mainWindow.evaluate(() => {
    window.electronAPI?.onMenuEditorCommand?.((commandId) => {
      if (commandId === "speech.toggle") window.__speechDebug!.menuEvents += 1;
    });
  });

  const filePath = path.join(workerRoot, "projects", "speech.mdi");
  await writeFile(filePath, "読み上げる文章です", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await selectEditorText(mainWindow);
  await expect(mainWindow.getByRole("toolbar", { name: "選択範囲の書式" })).toBeVisible();
  await expect(mainWindow.getByRole("button", { name: "読み上げを開始" })).toBeVisible();

  await nativeHarness.speechToggle();
  await expect
    .poll(() =>
      mainWindow.evaluate(
        () =>
          (
            window as Window & {
              __speechDebug?: {
                speakCalls: number;
                startCalls: number;
                boundaryCalls: number;
                menuEvents: number;
              };
            }
          ).__speechDebug,
      ),
    )
    .toMatchObject({ speakCalls: 1, startCalls: 1, boundaryCalls: 1, menuEvents: 1 });
  await expect(mainWindow.locator(".speech-reading")).toHaveCount(1);
  await expect(mainWindow.getByRole("button", { name: "読み上げを一時停止" })).toBeVisible();

  await nativeHarness.newTab();
  await expect(mainWindow.locator(".speech-reading")).toHaveCount(0);
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

test("POS highlight decorates active MDI content and clears when disabled", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "pos-highlight.mdi");
  await writeFile(filePath, "{東京|とうきょう}と^12^。", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await dismissStartupPrompts(mainWindow);

  const editor = visibleEditor(mainWindow);
  await expect(editor).toContainText("東京");
  await expect(editor).toContainText("12。");
  await expect(editor.locator("ruby[data-mdi-ruby]")).toHaveCount(1);

  await setPosHighlightEnabled(mainWindow, true);
  await expect
    .poll(async () => editor.locator("[data-pos-highlight-category]").count())
    .toBeGreaterThan(0);

  await setPosHighlightEnabled(mainWindow, false);
  await expect(editor.locator("[data-pos-highlight-category]")).toHaveCount(0);
});

test("POS highlight follows the active tab without leaking stale decorations", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const firstPath = path.join(workerRoot, "projects", "pos-a.mdi");
  const secondPath = path.join(workerRoot, "projects", "pos-b.md");
  await writeFile(firstPath, "東京へ行く", "utf8");
  await writeFile(secondPath, "大阪へ行く", "utf8");

  await nativeHarness.queueOpenPaths([firstPath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  await dismissStartupPrompts(mainWindow);
  await setPosHighlightEnabled(mainWindow, true);

  await expect(visibleEditor(mainWindow)).toContainText("東京へ行く");
  await expect
    .poll(async () => visibleEditor(mainWindow).locator("[data-pos-highlight-category]").count())
    .toBeGreaterThan(0);

  await nativeHarness.queueOpenPaths([secondPath]);
  await nativeHarness.open();
  await expect(visibleEditor(mainWindow)).toContainText("大阪へ行く");
  await expect
    .poll(async () => visibleEditor(mainWindow).locator("[data-pos-highlight-category]").count())
    .toBeGreaterThan(0);

  await mainWindow.getByText("pos-a.mdi", { exact: true }).click();
  await expect(visibleEditor(mainWindow)).toContainText("東京へ行く");
  await expect
    .poll(async () => visibleEditor(mainWindow).locator("[data-pos-highlight-category]").count())
    .toBeGreaterThan(0);
  await expect(visibleEditor(mainWindow)).not.toContainText("大阪へ行く");
});

test("native search menu prefills the current selection and navigates matches", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "search-menu.md");
  await writeFile(filePath, "東京 大阪 東京", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();

  await selectFirstOccurrence(mainWindow, "東京");
  await nativeHarness.openSearch();

  const searchInput = mainWindow.getByPlaceholder("検索...").last();
  await expect(searchInput).toBeVisible();
  await expect(searchInput).toHaveValue("東京");
  await expect(mainWindow.getByText("1/2")).toBeVisible();

  await nativeHarness.findNext();
  await expect(mainWindow.getByText("2/2")).toBeVisible();

  await nativeHarness.findPrevious();
  await expect(mainWindow.getByText("1/2")).toBeVisible();
});

test("native replace menu reuses the active interaction search state for current-file replace", async ({
  mainWindow,
  nativeHarness,
  workerRoot,
}) => {
  const filePath = path.join(workerRoot, "projects", "search-replace.md");
  await writeFile(filePath, "東京 東京", "utf8");
  await nativeHarness.queueOpenPaths([filePath]);
  await mainWindow.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const editor = mainWindow.locator(".ProseMirror").last();

  await selectFirstOccurrence(mainWindow, "東京");
  await nativeHarness.openReplace();

  const searchInput = mainWindow.getByPlaceholder("検索...").last();
  await expect(searchInput).toHaveValue("東京");
  await expect(mainWindow.getByPlaceholder("置換後...")).toBeVisible();
  await expect(mainWindow.getByText("2件見つかりました")).toBeVisible();

  await mainWindow.getByPlaceholder("置換後...").fill("大阪");
  await mainWindow.getByRole("button", { name: "すべて置換" }).click();
  await expect(mainWindow.getByRole("heading", { name: "置換の確認" })).toBeVisible();
  await mainWindow.getByRole("button", { name: "置換する" }).click();

  await expect(editor).toHaveText("大阪 大阪");
  await expect(mainWindow.getByText("検索結果がありません")).toBeVisible();
});
