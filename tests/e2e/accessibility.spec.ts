import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./guards";

// Each concrete route is scanned independently at both configured viewports.
// An empty route and a populated step are distinct accessibility states.
const routes = [
  "/",
  "/about",
  "/privacy",
  "/onboarding",
  "/today",
  "/steps",
  "/steps/new",
  "/steps/routines",
  "/steps/missing",
  "/reflect",
  "/reflect/conversation",
  "/reflect/thoughts",
  "/reflect/journal",
  "/reflect/review",
  "/connect",
  "/connect/care",
  "/settings",
  "/settings/privacy",
  "/settings/memory",
  "/settings/reminders",
  "/settings/appearance",
  "/help",
  "/help/report",
  "/review",
  "/unknown-review-route",
] as const;

for (const route of routes) {
  test(`accessibility: ${route}, route heading focus and one-click Help`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await expect(
      page
        .getByRole("banner")
        .getByRole("link", { name: "Help & support", exact: true }),
    ).toHaveAttribute("href", "/help");
  });
}

test("accessibility: populated step report, adaptation and confirmation", async ({
  page,
}) => {
  await page.goto("/steps/new");
  await page.getByLabel("Your step", { exact: true }).fill("Read a short page");
  await page
    .getByLabel("What do you expect will happen? (optional)", { exact: true })
    .fill("A page may be too much");
  await page
    .getByRole("button", { name: "Choose this step", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("How it went", { exact: true }).selectOption("Partly");
  await page
    .getByRole("button", { name: "Save how it went", exact: true })
    .click();
  await expect(page.locator("#report-feedback")).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByLabel("Smaller version", { exact: true })
    .fill("Read one line");
  await page
    .getByRole("button", { name: "Preview the change", exact: true })
    .click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Delete step", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Delete this step?", exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("accessibility: Connect message/report, care document and plain view", async ({
  page,
}) => {
  await page.goto("/connect");
  await page
    .getByLabel("Who feels safe to contact?", { exact: true })
    .selectOption("person");
  await page
    .locator("summary")
    .filter({ hasText: "After you reach out" })
    .click();
  await expect(page.getByLabel("Your message", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.locator('main a[href="/settings/appearance"]').click();
  await page.getByLabel("Plain view", { exact: true }).check();
  await page.getByLabel("Reduce motion", { exact: true }).check();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.locator("[data-plain=true][data-motion=reduced]"),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Connect", exact: true }).click();
  await page.locator('main a[href="/connect/care"]').first().click();
  await page
    .getByLabel("Original notes", { exact: true })
    .fill("Ask about access");
  await page
    .getByRole("button", { name: "Use notes as starting summary", exact: true })
    .click();
  await expect(
    page.getByLabel("Editable factual summary", { exact: true }),
  ).toHaveValue("Ask about access");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
