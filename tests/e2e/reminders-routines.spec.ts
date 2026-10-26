import type { Page } from "@playwright/test";
import { test, expect } from "./guards";
import AxeBuilder from "@axe-core/playwright";

async function weekly(page: Page) {
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByRole("link", { name: /Weekly review/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Look back on a step",
  );
}

test("S3 routine and virtual reminder opt-in, quiet hours, pause, resume and removal", async ({
  page,
}) => {
  await page.goto("/steps/routines");
  await page.getByLabel("Kind").selectOption("rest");
  await page.getByLabel("Your routine").fill("Pause in my comfortable chair");
  await page.getByRole("button", { name: "Choose this routine" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Pause in my comfortable chair",
  );
  await page
    .getByRole("button", { name: "Preview a reminder", exact: true })
    .click();
  await page.getByLabel("Turn on a reminder preview").check();
  await page.getByLabel("Timezone").selectOption("UTC");
  await page.getByLabel("Preferred local hour").selectOption("23");
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.locator("#reminder-feedback")).toContainText(
    "Preview updated. No notifications will be sent.",
  );
  await expect(page.locator("[data-next-preview]")).toHaveAttribute(
    "datetime",
    "2026-10-26T08:00:00.000Z",
  );
  await expect(
    page.getByText("Moved out of your quiet hours.", { exact: true }),
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
  await page.getByRole("button", { name: "+1 day" }).click();
  await expect(page.locator("[data-next-preview]")).toHaveAttribute(
    "datetime",
    "2026-10-27T08:00:00.000Z",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Open step", exact: true }).click();
  await page.getByRole("button", { name: "Pause step", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview a reminder", exact: true })
    .click();
  await expect(page.locator("[data-next-preview]")).toHaveCount(0);
  await page.getByRole("link", { name: "Open step", exact: true }).click();
  await page.getByRole("button", { name: "Delete step", exact: true }).click();
  await page
    .getByRole("button", { name: "Yes, delete step", exact: true })
    .click();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByRole("link", { name: /Reminder preview/ }).click();
  await expect(page.getByLabel("Turn on a reminder preview")).not.toBeChecked();
  await expect(page.locator("[data-next-preview]")).toHaveCount(0);
});

test("S3 weekly reflection changes a plan while keeping original prediction and report", async ({
  page,
}) => {
  await page.goto("/steps/new");
  await page.getByLabel("Your step").fill("Read a page");
  await page
    .getByLabel("What do you expect will happen? (optional)")
    .fill("A page may be too much");
  await page.getByRole("button", { name: "Choose this step" }).press("Enter");
  await page.getByLabel("How it went").selectOption("Partly");
  await page
    .getByLabel("How did it compare with what you expected?")
    .fill("A line felt enough");
  await page.getByRole("button", { name: "Save how it went" }).press("Enter");
  await weekly(page);
  await page
    .getByLabel("What did it give you?")
    .fill("A brief moment with a book");
  await page.getByLabel("How much effort did it take?").selectOption("more");
  await page.getByLabel("Was it useful?").selectOption("mixed");
  await page.getByLabel("What next?").selectOption("shrink");
  await page.getByLabel("Smaller version").fill("Read one line");
  await page
    .getByRole("button", { name: "Save the smaller version" })
    .press("Enter");
  await expect(page.locator("#weekly-feedback")).toContainText(
    "smaller version is on Today",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("link", { name: "Open step", exact: true })
    .press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Read one line",
  );
  await expect(
    page.getByText("A page may be too much", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A line felt enough", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("How it went")).toHaveValue("");
});

test("S3 weekly support/switch stop old follow-up and a routine can be edited or stopped", async ({
  page,
}) => {
  await page.goto("/steps/routines");
  await page.getByLabel("Your routine").fill("Put one evening task aside");
  await page.getByRole("button", { name: "Choose this routine" }).click();
  await weekly(page);
  await page.getByLabel("What next?").selectOption("support");
  await page
    .getByRole("button", { name: "Pause it and open Help & support" })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByRole("link", { name: /Routines/ }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page
    .getByLabel("Change the routine")
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
  await page
    .getByRole("button", { name: "Pause routine", exact: true })
    .click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await weekly(page);
  await page.getByLabel("What next?").selectOption("switch");
  await page
    .getByRole("button", { name: "Pause it and write a new step" })
    .click();
  await expect(page).toHaveURL(/\/steps\/new$/);
});

test("S3 invalid preferences and clock keep drafts and focus the relevant error", async ({
  page,
}) => {
  await page.goto("/settings/reminders");
  await page.getByLabel("Turn on a reminder preview").check();
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.getByLabel("Step")).toBeFocused();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Choose the step",
  );
  await page
    .getByLabel("Set the virtual clock (ISO time)")
    .fill("not an ISO time");
  await page.getByRole("button", { name: "Set time" }).click();
  await expect(
    page.getByLabel("Set the virtual clock (ISO time)"),
  ).toBeFocused();
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Help & support" })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Set the virtual clock (ISO time)")).toHaveValue(
    "not an ISO time",
  );
  await expect(page.getByLabel("Turn on a reminder preview")).toBeChecked();
  await expect(page.locator("[data-next-preview]")).toHaveCount(0);
});
