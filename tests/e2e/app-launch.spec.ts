import { test, expect } from "./fixtures/electron";

test("@smoke launches the desktop renderer and closes cleanly", async ({
  electronApp,
  mainWindow,
}) => {
  await expect(mainWindow.locator("body")).toBeVisible();
  expect(electronApp.windows().length).toBeGreaterThan(0);
});
