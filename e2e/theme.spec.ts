import { expect, test } from "@playwright/test";
import {
  completeSetup,
  createTestDataDir,
  launchApp,
  removeTestDataDir,
  waitForDashboard,
  type TestApp,
} from "./app";

/**
 * Theme choice: applied now, and still there after a restart.
 *
 * The switch writes to the settings table and to the pre-paint hint in
 * localStorage. This test exercises both paths against the real application.
 */

test("theme applies immediately and survives a relaunch", async () => {
  const dataDir = createTestDataDir();
  let testApp: TestApp | null = null;

  try {
    testApp = await launchApp(dataDir);
    const page = testApp.window;
    await completeSetup(page);
    await waitForDashboard(page);

    const isDark = (): Promise<boolean> =>
      page.evaluate(() => document.documentElement.classList.contains("dark"));

    const choose = async (label: "Light" | "Dark"): Promise<void> => {
      await page.getByRole("button", { name: /^Theme:/ }).click();
      await page.getByRole("menuitemradio", { name: label }).click();
      // Radix unmounts the menu after its exit animation; waiting here keeps
      // the next trigger click from landing on the old menu.
      await page.waitForTimeout(250);
    };

    await choose("Light");
    await expect.poll(isDark).toBe(false);

    await choose("Dark");
    await expect.poll(isDark).toBe(true);

    await testApp.close();
    testApp = null;

    const relaunched = await launchApp(dataDir);
    testApp = relaunched;
    const reopened = relaunched.window;

    // A restart may land on the login screen or restore the session. Either is
    // fine: the theme is read before the shell is chosen.
    await Promise.race([
      reopened.getByRole("button", { name: /^sign in$/i }).waitFor({ timeout: 30_000 }),
      reopened.getByRole("navigation").first().waitFor({ timeout: 30_000 }),
    ]);

    // The settings read finishes after the window is up, so poll rather than
    // assume the first frame already has the stored class.
    await expect
      .poll(() => reopened.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);
  } finally {
    if (testApp !== null) await testApp.close();
    removeTestDataDir(dataDir);
  }
});
