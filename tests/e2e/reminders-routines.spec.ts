import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function weekly(page: Page) {
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByRole("link", { name: /Weekly reflection/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A check-in that can change the plan.",
  );
}

test("S3 routine and virtual reminder opt-in, quiet hours, pause, resume and removal", async ({
  page,
}) => {
  await page.goto("/steps/routines");
  await page.getByLabel("Routine type").selectOption("rest");
  await page.getByLabel("Your routine").fill("Pause in my comfortable chair");
  await page.getByRole("button", { name: "Choose this routine" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Pause in my comfortable chair",
  );
  await page
    .getByRole("link", { name: "Reminder preview", exact: true })
    .click();
  await page.getByLabel("Opt in to a reminder preview").check();
  await page.getByLabel("Timezone").selectOption("UTC");
  await page.getByLabel("Preferred local hour").selectOption("23");
  await page.getByRole("button", { name: "Apply preview preferences" }).click();
  await expect(page.locator("#reminder-feedback")).toContainText(
    "Preview updated. No notifications will be sent.",
  );
  await expect(page.locator("[data-next-preview]")).toHaveAttribute(
    "datetime",
    "2026-10-26T08:00:00.000Z",
  );
  await expect(
    page.getByText("Moved out of quiet hours.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause preview", exact: true })
    .click();
  await expect(
    page.getByText("Reminder preview is paused. Nothing is pending.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume preview", exact: true })
    .click();
  await expect(page.locator("[data-next-preview]")).toBeVisible();
  await page.getByRole("button", { name: "Advance one virtual day" }).click();
  await expect(page.locator("[data-next-preview]")).toHaveAttribute(
    "datetime",
    "2026-10-27T08:00:00.000Z",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Open selected step" }).click();
  await page.getByRole("button", { name: "Pause step", exact: true }).click();
  await page
    .getByRole("link", { name: "Reminder preview", exact: true })
    .click();
  await expect(page.locator("[data-next-preview]")).toHaveCount(0);
  await page.getByRole("link", { name: "Open selected step" }).click();
  await page.getByRole("button", { name: "Remove step", exact: true }).click();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByRole("link", { name: /Reminder preview/ }).click();
  await expect(
    page.getByLabel("Opt in to a reminder preview"),
  ).not.toBeChecked();
  await expect(page.locator("[data-next-preview]")).toHaveCount(0);
});

test("S3 weekly reflection changes a plan while keeping original prediction and report", async ({
  page,
}) => {
  await page.goto("/steps/new");
  await page.getByLabel("Your step").fill("Read a page");
  await page.getByLabel("Prediction (optional)").fill("A page may be too much");
  await page.getByRole("button", { name: "Choose this step" }).press("Enter");
  await page.getByLabel("What happened?").selectOption("Partly");
  await page
    .getByLabel("What was it like? (optional)")
    .fill("A line felt enough");
  await page
    .getByRole("button", { name: "Record this experience" })
    .press("Enter");
  await weekly(page);
  await page
    .getByLabel("What did this make room for? (optional)")
    .fill("A brief moment with a book");
  await page.getByLabel("Effort (optional)").selectOption("more");
  await page.getByLabel("Helpfulness (optional)").selectOption("mixed");
  await page.getByLabel("Next approach").selectOption("shrink");
  await page.getByLabel("Your adjusted step").fill("Read one line");
  await page.getByRole("button", { name: "Apply this review" }).press("Enter");
  await expect(page.locator("#weekly-feedback")).toContainText("next version");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Open reviewed step" }).press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Read one line",
  );
  await expect(
    page.getByText("A page may be too much", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A line felt enough", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("What happened?")).toHaveValue("");
});

test("S3 weekly support/switch stop old follow-up and a routine can be edited or stopped", async ({
  page,
}) => {
  await page.goto("/steps/routines");
  await page.getByLabel("Your routine").fill("Put one evening task aside");
  await page.getByRole("button", { name: "Choose this routine" }).click();
  await weekly(page);
  await page.getByLabel("Next approach").selectOption("support");
  await page.getByRole("button", { name: "Apply this review" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByRole("link", { name: /Flexible routines/ }).click();
  await expect(
    page.getByText("Stopped for now", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Adjusted routine")
    .fill("Put one optional evening task aside");
  await page
    .getByRole("button", { name: "Update routine", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Put one optional evening task aside" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume routine", exact: true })
    .click();
  await page.getByRole("button", { name: "Stop routine", exact: true }).click();
  await expect(
    page.getByText("Stopped for now", { exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await weekly(page);
  await page.getByLabel("Next approach").selectOption("switch");
  await page.getByRole("button", { name: "Apply this review" }).click();
  await expect(page).toHaveURL(/\/steps\/new$/);
});

test("S3 invalid preferences and clock keep drafts and focus the relevant error", async ({
  page,
}) => {
  await page.goto("/settings/reminders");
  await page.getByLabel("Opt in to a reminder preview").check();
  await page.getByRole("button", { name: "Apply preview preferences" }).click();
  await expect(page.getByLabel("Step to follow up")).toBeFocused();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Choose a step",
  );
  await page.getByLabel("Virtual clock (ISO time)").fill("not an ISO time");
  await page.getByRole("button", { name: "Apply virtual time" }).click();
  await expect(page.getByLabel("Virtual clock (ISO time)")).toBeFocused();
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Help & support" })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Virtual clock (ISO time)")).toHaveValue(
    "not an ISO time",
  );
  await expect(page.getByLabel("Opt in to a reminder preview")).toBeChecked();
  await expect(page.locator("[data-next-preview]")).toHaveCount(0);
});
