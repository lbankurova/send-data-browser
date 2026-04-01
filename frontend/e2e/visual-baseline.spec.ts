import { test, expect } from "@playwright/test";

/**
 * Visual baseline tests — capture screenshots of key views.
 * Run: npx playwright test e2e/visual-baseline.spec.ts
 *
 * These tests require the backend running on :8000 with PointCross generated.
 * Frontend dev server starts automatically via playwright.config.ts webServer.
 */

const STUDY = "PointCross";

test.describe("Visual baselines", () => {
  test.beforeEach(async ({ page }) => {
    // Wait for the app to load
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("Landing page", async ({ page }) => {
    await expect(page.locator("text=SENDEX")).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "e2e/screenshots/landing.png", fullPage: true });
  });

  test("Findings view — rail + center panel", async ({ page }) => {
    // Navigate to PointCross findings
    await page.goto(`/study/${STUDY}/findings`);
    await page.waitForLoadState("networkidle");
    // Wait for rail to populate
    await page.waitForSelector("[aria-label='Findings navigation']", { timeout: 15000 });
    // Wait a bit for signal scores to compute
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "e2e/screenshots/findings-rail.png", fullPage: true });
  });

  test("Findings view — endpoint selected", async ({ page }) => {
    await page.goto(`/study/${STUDY}/findings`);
    await page.waitForSelector("[aria-label='Findings navigation']", { timeout: 15000 });
    await page.waitForTimeout(1000);
    // Click first endpoint row in the rail
    const firstEndpoint = page.locator("button").filter({ has: page.locator("[class*='font-mono']") }).first();
    if (await firstEndpoint.isVisible()) {
      await firstEndpoint.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: "e2e/screenshots/findings-endpoint-selected.png", fullPage: true });
    }
  });

  test("Dose-response view", async ({ page }) => {
    await page.goto(`/study/${STUDY}/dose-response`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/dose-response.png", fullPage: true });
  });

  test("Study summary", async ({ page }) => {
    await page.goto(`/study/${STUDY}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "e2e/screenshots/study-summary.png", fullPage: true });
  });

  test("Histopathology view", async ({ page }) => {
    await page.goto(`/study/${STUDY}/histopathology`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/histopathology.png", fullPage: true });
  });
});
