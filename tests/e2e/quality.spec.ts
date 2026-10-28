import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, startAsGuest } from "./helpers";

const pages = [
  "/today",
  "/talk",
  "/shelf",
  "/you",
  "/intake",
  "/today/add",
  "/today/problem",
  "/you/look-back",
  "/you/look-back/journey",
  "/you/people",
  "/you/care",
  "/you/notes",
  "/you/place",
  "/you/account",
  "/you/knows",
  "/you/reminders",
  "/you/appearance",
  "/you/data",
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
  // "/" opens the welcome dialog by itself, so it is checked open and closed.
  for (const [path, closeDialog] of [
    ["/", false],
    ["/", true],
    ["/sign-in", false],
    ["/help", false],
    ["/about", false],
    ["/privacy", false],
  ] as const) {
    await page.goto(path);
    if (path === "/") {
      const dialog = page.getByRole("dialog", { name: "Welcome to Koe" });
      await expect(dialog).toBeVisible();
      if (closeDialog) {
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      }
    }
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
  // The open welcome dialog fits too.
  await page.goto("/");
  await expect(page.getByRole("dialog")).toBeVisible();
  await noHorizontalScroll(page);
  await startAsGuest(page);
  for (const path of [
    "/today",
    "/talk",
    "/shelf",
    "/you",
    "/intake",
    "/today/add",
    "/you/people",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await noHorizontalScroll(page);
    await expect(
      page.getByRole("link", { name: "Help", exact: true }),
    ).toBeInViewport();
  }
});
