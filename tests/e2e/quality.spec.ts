import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, startAsGuest } from "./helpers";

const pages = [
  "/today",
  "/steps",
  "/steps/new",
  "/steps/problem",
  "/reflect",
  "/reflect/talk",
  "/reflect/journey",
  "/reflect/week",
  "/connect",
  "/connect/care",
  "/settings",
  "/settings/account",
  "/settings/memory",
  "/settings/reminders",
  "/settings/appearance",
  "/settings/privacy",
  "/help",
];

test("signed-in pages pass axe and fit the screen", async ({ page }) => {
  test.setTimeout(120_000);
  await startAsGuest(page);
  for (const path of pages) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((v) => `${path}: ${v.id} (${v.nodes.length})`),
    ).toEqual([]);
    await noHorizontalScroll(page);
  }
});

test("public pages pass axe and say what Koe is", async ({ page }) => {
  for (const path of [
    "/",
    "/start",
    "/sign-in",
    "/help",
    "/about",
    "/privacy",
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((v) => `${path}: ${v.id} (${v.nodes.length})`),
    ).toEqual([]);
    await noHorizontalScroll(page);
    await expect(page.getByText(/fictional|preview|review build/i)).toHaveCount(
      0,
    );
  }
  await page.goto("/");
  await expect(page.getByText(/AI tool, not a/).first()).toBeVisible();
});

test("works at 320px wide", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await startAsGuest(page);
  for (const path of ["/today", "/steps/new", "/reflect/talk", "/connect"]) {
    await page.goto(path);
    await noHorizontalScroll(page);
  }
});
