import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, startAsGuest } from "./helpers";

test("reflection report shows labelled demo data", async ({ page }) => {
  await startAsGuest(page);
  await page.goto("/you/reflection");
  await expect(
    page.getByRole("heading", { level: 1, name: "Reflection report" }),
  ).toBeVisible();
  await expect(
    page.getByText("Demo data. These values are made up"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print report" }),
  ).toBeVisible();
  await expect(
    page.getByText("Low on 9 days, okay on 12, more on 7."),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: "Week 2 3 2 8" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(5);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 800 });
  await noHorizontalScroll(page);
});
