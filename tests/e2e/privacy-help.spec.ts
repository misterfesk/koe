import { test, expect } from "./guards";
import { readFile } from "node:fs/promises";
test("S2 onboarding choices carry to Today, Help needs no setup, export/delete/reset are real local controls", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Help & support" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Reach a person",
  );
  // The emergency instruction is the first thing under the heading.
  await expect(page.locator("main .lede")).toContainText("immediate danger");
  await page.goBack();
  await page.getByLabel("I am reviewing this as an adult (18+)").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Focus").selectOption("Connection");
  await page.getByLabel("Energy today").selectOption("low");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Country / region").selectOption("SG");
  await page.getByRole("button", { name: "Open Today" }).click();
  await expect(
    page.getByText("Today · Connection", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "One thing at a time.",
  );
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Help & support" })
    .click();
  await expect(page.getByLabel("Country / region")).toHaveValue("SG");
  await expect(page.getByText("1767", { exact: true })).toBeVisible();
  await expect(page.getByText("Last checked 2026-10-25")).toBeVisible();
  await page.getByLabel("Country / region").selectOption("OTHER");
  await expect(
    page.getByText("No verified resource listed yet.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Your data" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export session (JSON)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("koe-synthetic-session.json");
  const path = await file.path();
  if (!path) throw new Error("Export download missing");
  const exported = JSON.parse(await readFile(path, "utf8"));
  expect(exported.kind).toBe("synthetic-private-review");
  expect(exported.data.goal).toBe("Connection");
  await page.getByRole("button", { name: "Delete session data" }).click();
  await expect(
    page.getByRole("heading", { name: "Delete everything in this session?" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(
    page.getByRole("button", { name: "Delete session data" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Delete session data" }).click();
  await page
    .getByRole("button", { name: "Yes, delete everything", exact: true })
    .click();
  await expect(page.locator("#privacy-feedback")).toBeFocused();
  await expect(page.getByRole("status")).toContainText("Session data deleted");
  await expect(page.getByLabel("Suggestions on")).not.toBeChecked();
  await page.getByRole("button", { name: "Start over" }).click();
  await page
    .getByRole("button", { name: "Yes, start over", exact: true })
    .click();
  await expect(page.getByLabel("Suggestions on")).toBeChecked();
});
test("S2 offline Help remains useful and issue reports are previews only", async ({
  page,
}) => {
  await page.goto("/review");
  await page.getByLabel("Fictional scenario").selectOption("provider offline");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Help & support" })
    .click();
  await expect(page.getByText("988", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Check locally before relying on this."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Report a problem" }).click();
  await page.getByLabel("What went wrong?").fill("A review-only issue");
  await page.getByRole("button", { name: "Preview report" }).click();
  await expect(page.getByRole("status")).toContainText("Nothing was submitted");
  await expect(page.locator("main pre")).toHaveText("A review-only issue");
});
