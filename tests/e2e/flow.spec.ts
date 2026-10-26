import { test, expect } from "./guards";

// Flow standards from UX-AND-COPY.md (D023): hub, context carried, undo before reset.

test("Today offers another suggestion, takes energy in place, and undoes Not today", async ({
  page,
}) => {
  await page.goto("/today");
  const card = page.locator(".dark-panel h2");
  const first = await card.textContent();
  await page.getByRole("button", { name: "Show another", exact: true }).click();
  await expect(card).not.toHaveText(first ?? "");
  await expect(page.getByText(/Suggestion 2 of \d/)).toBeVisible();

  await page.getByLabel("Energy today").selectOption("low");
  await expect(card).toHaveText("Pause somewhere comfortable for one minute");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "One thing at a time.",
  );

  await page.getByRole("button", { name: "Not today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You can leave it here." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show the suggestion again", exact: true })
    .click();
  await expect(card).toHaveText("Pause somewhere comfortable for one minute");
});

test("a chosen step leads back to Today, preselects its reminder and asks before deleting", async ({
  page,
}) => {
  await page.goto("/steps/new");
  await page.getByLabel("Your step").fill("Water one plant");
  await page.getByRole("button", { name: "Choose this step" }).click();
  await expect(
    page.getByRole("heading", { name: "How did it go?" }),
  ).toBeVisible();
  await expect(page.getByText(/Until then it stays on Today/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Today" })).toBeVisible();

  await page
    .getByRole("button", { name: "Preview a reminder", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/reminders$/);
  await expect(page.getByLabel("Step")).toHaveValue(/step-\d+/);
  await expect(page.locator("main .lede")).toContainText("Water one plant");
  await page.getByRole("link", { name: "Back to the step" }).click();

  await page.getByRole("button", { name: "Delete step", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Delete this step?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Water one plant" }),
  ).toBeVisible();
});

test("thought reflection offers a step and a memory card only after finishing", async ({
  page,
}) => {
  await page.goto("/reflect/thoughts");
  await expect(
    page.getByRole("button", { name: "Skip", exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByLabel("A step in your words")).toHaveCount(0);
  await expect(page.getByText("Keep a memory card")).toHaveCount(0);
  await page.getByRole("button", { name: "Finish reflection" }).click();
  await expect(page.getByLabel("A step in your words")).toBeVisible();
  await expect(page.getByText("Keep a memory card")).toBeVisible();
});
