/* eslint-disable react-hooks/rules-of-hooks */

import {
  test as base,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

type CapturedMenuItem = {
  label?: string;
  accelerator?: string;
  role?: string;
  command?: string;
  enabled?: boolean;
  type?: string;
};

type NativeHarness = {
  newTab(): Promise<void>;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  open(): Promise<void>;
  closeTab(): Promise<void>;
  openSearch(): Promise<void>;
  findNext(): Promise<void>;
  findPrevious(): Promise<void>;
  openReplace(): Promise<void>;
  queueSavePath(filePath: string): Promise<void>;
  queueOpenPaths(filePaths: string[]): Promise<void>;
  selectContextCommand(command: string): Promise<void>;
  takeContextMenus(): Promise<CapturedMenuItem[][]>;
  readSavedFile(filePath: string): Promise<string>;
};

type Fixtures = {
  electronApp: ElectronApplication;
  mainWindow: Page;
  nativeHarness: NativeHarness;
};
type WorkerFixtures = { workerRoot: string };

export const test = base.extend<Fixtures, WorkerFixtures>({
  workerRoot: [
    async ({}, use, workerInfo) => {
      const artifactsRoot = path.join(
        process.cwd(),
        "test-results",
        "e2e-workers",
        `run-${process.pid}`,
      );
      await mkdir(artifactsRoot, { recursive: true });
      const root = await mkdtemp(path.join(artifactsRoot, `worker-${workerInfo.workerIndex}-`));
      for (const name of ["user-data", "projects", "downloads", "exports"])
        await mkdir(path.join(root, name));
      await use(root);
    },
    { scope: "worker" },
  ],
  electronApp: async ({ workerRoot }, use) => {
    const diagnostics: string[] = [];
    const executablePath = process.env.ILLUSIONS_E2E_EXECUTABLE;
    const userDataDir = await mkdtemp(path.join(workerRoot, "user-data-"));
    let expectedExit = false;
    const app = await electron.launch({
      ...(executablePath ? { executablePath } : {}),
      args: [...(executablePath ? [] : ["."]), `--user-data-dir=${userDataDir}`],
      env: { ...process.env, ILLUSIONS_E2E: "1", ELECTRON_ENABLE_LOGGING: "1" },
      timeout: 30_000,
    });
    const waitForExit = new Promise<void>((resolve) => {
      app.process().once("exit", () => resolve());
    });
    app.process().stdout?.on("data", (chunk) => diagnostics.push(`[main:stdout] ${chunk}`));
    app.process().stderr?.on("data", (chunk) => diagnostics.push(`[main:stderr] ${chunk}`));
    const unexpectedExit = new Promise<never>((_, reject) => {
      app.process().once("exit", (code, signal) => {
        if (!expectedExit)
          reject(new Error(`Electron exited unexpectedly (code=${code}, signal=${signal})`));
      });
    });
    try {
      await Promise.race([use(app), unexpectedExit]);
    } finally {
      if (diagnostics.length)
        test
          .info()
          .attach("main-process.log", { body: diagnostics.join(""), contentType: "text/plain" });
      expectedExit = true;
      const failed = test.info().status !== test.info().expectedStatus;
      if (failed && app.process().exitCode == null) app.process().kill();
      if (!failed && app.process().exitCode == null)
        await app
          .evaluate(({ app: electronApp }) => {
            electronApp.releaseSingleInstanceLock?.();
            electronApp.quit();
          })
          .catch(() => undefined);
      await Promise.race([
        waitForExit,
        new Promise<void>((resolve) => setTimeout(resolve, failed ? 5_000 : 10_000)),
      ]);
      if (app.process().exitCode == null) {
        app.process().kill();
        await Promise.race([
          waitForExit,
          new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
        ]);
      }
      await Promise.race([
        app.close().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
      ]);
    }
  },
  nativeHarness: async ({ electronApp, mainWindow: _mainWindow }, use) => {
    await electronApp.evaluate(({ dialog, Menu, BrowserWindow }) => {
      const originalBuildFromTemplate = Menu.buildFromTemplate.bind(Menu);
      const originalGetFocusedWindow = BrowserWindow.getFocusedWindow.bind(BrowserWindow);
      // E2E windows are intentionally hidden, so Electron has no OS-focused
      // window.  Production menu handlers use getFocusedWindow(); make their
      // existing event route deterministic without adding a production IPC.
      BrowserWindow.getFocusedWindow = () =>
        originalGetFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
      const state = {
        savePaths: [] as string[],
        openPaths: [] as string[][],
        selectedCommand: null as string | null,
        menus: [] as CapturedMenuItem[][],
      };
      Object.assign(globalThis, { __illusionsE2E: state });
      dialog.showSaveDialog = async () => ({
        canceled: state.savePaths.length === 0,
        filePath: state.savePaths.shift() ?? "",
      });
      dialog.showOpenDialog = async () => ({
        canceled: state.openPaths.length === 0,
        filePaths: state.openPaths.shift() ?? [],
      });
      Menu.buildFromTemplate = ((template: Electron.MenuItemConstructorOptions[]) => {
        const getCommand = (item: Electron.MenuItemConstructorOptions): string | undefined =>
          (item as Electron.MenuItemConstructorOptions & { command?: string }).command;
        const isEditorContextMenu =
          template.length === 10 &&
          template.filter((item) => item.type === "separator").length === 3 &&
          template.some((item) => item.role === "undo") &&
          template.some((item) => item.role === "selectAll") &&
          template.some((item) => getCommand(item) === "format.tcy");
        if (!isEditorContextMenu) return originalBuildFromTemplate(template);

        state.menus.push(
          template.map((item) => ({
            label: item.label,
            accelerator: typeof item.accelerator === "string" ? item.accelerator : undefined,
            role: item.role,
            command: getCommand(item),
            enabled: item.enabled,
            type: item.type,
          })),
        );
        const menu = originalBuildFromTemplate(template);
        const originalPopup = menu.popup.bind(menu);
        menu.popup = ((options?: Electron.PopupOptions) => {
          const commandToRole: Record<string, string> = {
            "edit.undo": "undo",
            "edit.redo": "redo",
            "edit.cut": "cut",
            "edit.copy": "copy",
            "edit.paste": "paste",
            "edit.selectAll": "selectAll",
          };
          const selectedCommand = state.selectedCommand;
          const role = selectedCommand ? commandToRole[selectedCommand] : undefined;
          state.selectedCommand = null;
          const item = role
            ? template.find((candidate) => candidate.role === role)
            : template.find((candidate) => getCommand(candidate) === selectedCommand);
          if (item && options?.window) {
            if (item.click)
              item.click({} as Electron.MenuItem, options.window, {} as Electron.KeyboardEvent);
            else if ("webContents" in options.window) {
              const contents = (options.window as Electron.BrowserWindow).webContents;
              if (role === "undo") contents.undo();
              if (role === "redo") contents.redo();
              if (role === "cut") contents.cut();
              if (role === "copy") contents.copy();
              if (role === "paste") contents.paste();
              if (role === "selectAll") contents.selectAll();
            }
            options.callback?.();
            return;
          }
          return originalPopup(options);
        }) as typeof menu.popup;
        return menu;
      }) as typeof Menu.buildFromTemplate;
    });
    const mutate = async (operation: string, value?: string | string[]) =>
      electronApp.evaluate(
        ({ BrowserWindow, Menu }, { operation: op, value: next }) => {
          const state = (
            globalThis as typeof globalThis & {
              __illusionsE2E: {
                savePaths: string[];
                openPaths: string[][];
                selectedCommand: string | null;
                menus: CapturedMenuItem[][];
              };
            }
          ).__illusionsE2E;
          if (op === "save") state.savePaths.push(next as string);
          if (op === "open") state.openPaths.push(next as string[]);
          if (op === "context") state.selectedCommand = next as string;
          if (op === "take-menus") return state.menus.splice(0);
          const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
          const labels: Record<string, string> = {
            "new-tab": "新しいタブ",
            "save-menu": "保存",
            "save-as-menu": "別名で保存...",
            "open-menu": "ファイルを開く...",
            "close-tab": "タブを閉じる",
            "open-search": "検索...",
            "find-next": "次を検索",
            "find-previous": "前を検索",
            "open-replace": "置換...",
          };
          const label = labels[op];
          if (label) {
            const pending = [...(Menu.getApplicationMenu()?.items ?? [])];
            while (pending.length) {
              const item = pending.shift();
              if (!item) continue;
              if (item.label === label && item.click) {
                item.click(item, window, {} as Electron.KeyboardEvent);
                return true;
              }
              if (item.submenu) pending.push(...item.submenu.items);
            }
            return false;
          }
          return undefined;
        },
        { operation, value },
      );
    const invokeMenu = async (operation: string): Promise<void> => {
      if ((await mutate(operation)) !== true)
        throw new Error(`Application menu action was not found: ${operation}`);
    };
    await use({
      newTab: async () => invokeMenu("new-tab"),
      save: async () => invokeMenu("save-menu"),
      saveAs: async () => invokeMenu("save-as-menu"),
      open: async () => invokeMenu("open-menu"),
      closeTab: async () => invokeMenu("close-tab"),
      openSearch: async () => invokeMenu("open-search"),
      findNext: async () => invokeMenu("find-next"),
      findPrevious: async () => invokeMenu("find-previous"),
      openReplace: async () => invokeMenu("open-replace"),
      queueSavePath: async (filePath) => void (await mutate("save", filePath)),
      queueOpenPaths: async (filePaths) => void (await mutate("open", filePaths)),
      selectContextCommand: async (command) => void (await mutate("context", command)),
      takeContextMenus: async () =>
        ((await mutate("take-menus")) as CapturedMenuItem[][] | undefined) ?? [],
      readSavedFile: async (filePath) => readFile(filePath, "utf8"),
    });
  },
  mainWindow: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    const rendererErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(`[console] ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      const detail = [error.name, error.message, error.stack]
        .filter((part): part is string => Boolean(part?.trim()))
        .join("\n");
      if (detail) rendererErrors.push(`[pageerror] ${detail}`);
    });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(
      () => document.readyState === "complete" && document.body.childElementCount > 0,
    );
    await expect(page.locator("body")).toBeVisible();
    await expect(
      page.locator('.ProseMirror, button:has-text("ファイルを開く")').first(),
    ).toBeVisible();
    await use(page);
    if (rendererErrors.length) throw new Error(`Renderer errors:\n${rendererErrors.join("\n")}`);
  },
});

export { expect };
