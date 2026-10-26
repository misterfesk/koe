import { test, expect } from "./guards";

// Owner decisions D022 (2026-10-26) taken after the S3/S4 review.

test("coaching paused pauses weekly review, routines and reminders, with Help one click away", async ({
  page,
}) => {
  await page.goto("/review");
  await page.getByLabel("Fictional scenario").selectOption("coaching paused");
  for (const href of [
    "/reflect/review",
    "/steps/routines",
    "/settings/reminders",
  ]) {
    await page.getByRole("link", { name: "Review explorer" }).click();
    await page.locator(`main a[href="${href}"]`).first().click();
    await expect(
      page.getByRole("heading", {
        name: "Ordinary coaching is paused.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Open Help & support" }),
    ).toBeVisible();
  }
});

test("provider offline: Today hides the idea and explains gently", async ({
  page,
}) => {
  await page.goto("/review");
  await page.getByLabel("Fictional scenario").selectOption("provider offline");
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Suggestions are offline right now." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Choose this step/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("link", { name: "Write my own step" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Help & support" }),
  ).toBeVisible();
});

test("deleting a memory card can also remove steps chosen from it, opt-in", async ({
  page,
}) => {
  await page.goto("/settings/memory");
  await page.getByLabel("New card").fill("A fictional garden bench");
  await page.getByRole("button", { name: "Keep this card" }).click();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /A fictional garden bench/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Choose this step/ }).click();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.locator('main a[href="/settings/memory"]').first().click();
  await page.getByRole("button", { name: "Delete card", exact: true }).click();
  const remove = page.getByLabel("Also delete 1 step chosen from this card");
  await expect(remove).not.toBeChecked();
  await remove.check();
  await page
    .getByRole("button", { name: "Yes, delete card", exact: true })
    .click();
  await page.getByRole("link", { name: "Steps", exact: true }).click();
  await expect(page.getByText(/A fictional garden bench/)).toHaveCount(0);
});
