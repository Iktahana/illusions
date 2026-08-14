import {
  test as base,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type Fixtures = { electronApp: ElectronApplication; mainWindow: Page };
type WorkerFixtures = { workerRoot: string };

export const test = base.extend<Fixtures, WorkerFixtures>({
  workerRoot: [
    async ({}, use, workerInfo) => {
      const root = await mkdtemp(
        path.join(os.tmpdir(), `illusions-e2e-w${workerInfo.workerIndex}-`),
      );
      for (const name of ["user-data", "projects", "downloads", "exports"])
        await mkdir(path.join(root, name));
      await use(root);
    },
    { scope: "worker" },
  ],
  electronApp: async ({ workerRoot }, use) => {
    const diagnostics: string[] = [];
    const app = await electron.launch({
      args: [".", `--user-data-dir=${path.join(workerRoot, "user-data")}`],
      env: { ...process.env, ILLUSIONS_E2E: "1", ELECTRON_ENABLE_LOGGING: "1" },
      timeout: 30_000,
    });
    app.process().stdout?.on("data", (chunk) => diagnostics.push(`[main:stdout] ${chunk}`));
    app.process().stderr?.on("data", (chunk) => diagnostics.push(`[main:stderr] ${chunk}`));
    try {
      await use(app);
    } finally {
      if (diagnostics.length)
        test
          .info()
          .attach("main-process.log", { body: diagnostics.join(""), contentType: "text/plain" });
      await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => undefined);
      await app.close().catch(() => undefined);
    }
  },
  mainWindow: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    const rendererErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(`[console] ${message.text()}`);
    });
    page.on("pageerror", (error) =>
      rendererErrors.push(`[pageerror] ${error.stack ?? error.message}`),
    );
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();
    await use(page);
    if (rendererErrors.length) throw new Error(`Renderer errors:\n${rendererErrors.join("\n")}`);
  },
});

export { expect };
