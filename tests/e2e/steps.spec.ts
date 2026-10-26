import { test, expect } from "./guards";
test("S1 drafts, validation and versioned step lifecycle", async ({ page }) => {
  await page.goto("/steps/new");
  await page.getByLabel("Your step").fill("   ");
  await page.getByRole("button", { name: "Choose this step" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Give your step",
  );
  await expect(page.getByLabel("Your step")).toBeFocused();
  await page.getByLabel("Your step").fill("Read a page");
  await page
    .getByLabel("What do you expect will happen? (optional)")
    .fill("It might feel difficult");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Help & support" })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Your step")).toHaveValue("Read a page");
  await page.getByRole("button", { name: "Choose this step" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Read a page",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.getByLabel("How it went").selectOption("Partly");
  await page.getByLabel("What got in the way?").fill("Too much at once");
  await page
    .getByLabel("How did it compare with what you expected?")
    .fill("A line was enough");
  await page.getByRole("button", { name: "Save how it went" }).click();
  await expect(
    page.getByText("A line was enough", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#report-feedback")).toBeFocused();
  await page.getByLabel("Smaller version").fill("Read one line");
  await page.getByRole("button", { name: "Preview the change" }).click();
  await page.getByRole("button", { name: "Use this version" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Read one line",
  );
  await expect(page.getByLabel("How it went")).toHaveValue("");
  await expect(
    page.getByText("It might feel difficult", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Read one line" }),
  ).toBeVisible();
  await expect(page.getByText(/You said: Partly/)).toHaveCount(0);
  await page.getByRole("link", { name: "Steps", exact: true }).click();
  await expect(page.getByRole("link", { name: "Read one line" })).toBeVisible();
});
test("S1 skip is an exit, deleted steps differ from 404, long text reflows", async ({
  page,
}) => {
  await page.goto("/today");
  await page.getByRole("button", { name: "Not today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You can leave it here." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Write my own step" }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByLabel("Your step").fill("x".repeat(240));
  await page.getByRole("button", { name: "Choose this step" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "x".repeat(240),
  );
  await page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>("*")).map(
      (el) => [el, getComputedStyle(el).fontSize] as const,
    );
    for (const [el, size] of sizes)
      el.style.fontSize = Number.parseFloat(size) * 2 + "px";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Delete step" }).click();
  await page
    .getByRole("button", { name: "Yes, delete step", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "This step no longer exists." }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Help & support" }),
  ).toBeVisible();
});
