import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, proposeInterview, startAsGuest } from "./helpers";

test("returning interview saves a renamed thing without rewriting the intro or day", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startAsGuest(page);
  await page.goto("/intake");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let n = 0; n < 4; n++)
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);
  const before = await (await page.request.get("/api/export")).json();
  await page.getByRole("link", { name: /Tell Koe one thing/ }).click();
  await expect(page).toHaveURL(/\/intake#interview$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "What's one thing you'd like to get done this week?",
  );
  await expect(page.getByPlaceholder("e.g. Update my CV")).toBeVisible();
  await expect(page.getByRole("link", { name: "Leave for Today" })).toHaveCount(
    0,
  );
  await page.getByLabel("Your answer").fill("Update the CV");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await proposeInterview(page);
  await noHorizontalScroll(page);
  expect(
    (await (await page.request.get("/api/export")).json()).weeks,
  ).toHaveLength(0);
  await expect(page.getByText(/pieces/i)).toHaveCount(0);
  await expect(page.getByText("By the weekend", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Title").fill("Refresh the CV");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 3, name: "Refresh the CV" }),
  ).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page
    .getByRole("button", { name: "Save this week", exact: true })
    .click();
  await expect(page).toHaveURL(/\/today$/);
  const after = await (await page.request.get("/api/export")).json();
  expect(after.userModel).toEqual(before.userModel);
  expect(after.planDays).toEqual(before.planDays);
  expect(after.steps).toEqual(before.steps);
  expect(after.weeks).toHaveLength(1);
  expect(after.weeks[0].items[0].captured).toEqual({
    what: "Update the CV",
    when: "By the weekend",
    title: "Refresh the CV",
  });
  expect(after.weeks[0].items[0].pieces).toBeUndefined();
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) =>
        key.startsWith("koe.plan-draft:interview:"),
      ),
    ),
  ).toEqual([]);
});

test("stopping the interview keeps a usable Today and a way back", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.getByRole("link", { name: /Tell Koe one thing/ }).click();
  await expect(
    page.getByRole("button", { name: "That's enough for now", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Your answer").fill("Update the CV");
  await page
    .getByRole("button", { name: "That's enough for now", exact: true })
    .click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await page.getByRole("link", { name: /Tell Koe one thing/ }).click();
  await expect(page.getByLabel("Your answer")).toHaveValue("Update the CV");
});

test("a risk phrase stops the interview and never persists its words", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.getByRole("link", { name: /Tell Koe one thing/ }).click();
  await page.getByLabel("Your answer").fill("I want to end it all");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /are you safe right now/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => JSON.stringify(sessionStorage)),
  ).not.toContain("end it all");
  expect(
    (await (await page.request.get("/api/export")).json()).weeks,
  ).toHaveLength(0);
});

test("remove can be undone before saving", async ({ page }) => {
  await startAsGuest(page);
  await page.getByRole("link", { name: /Tell Koe one thing/ }).click();
  await page.getByLabel("Your answer").fill("Update the CV");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await proposeInterview(page);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Removed.", { exact: false })).toBeVisible();
  await expect(page.getByText("Nothing in This week yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save this week", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: "Update the CV" }),
  ).toBeVisible();
});

test("an interrupted save keeps the proposal and confirms only once on retry", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.getByRole("link", { name: /Tell Koe one thing/ }).click();
  await page.getByLabel("Your answer").fill("Update the CV");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await proposeInterview(page);
  await page.route("**/intake", async (route) => {
    if (route.request().headers()["next-action"]) await route.abort();
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Save this week", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Your draft is kept" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Update the CV" }),
  ).toBeVisible();
  await page.unroute("**/intake");
  await page
    .getByRole("button", { name: "Save this week", exact: true })
    .click();
  await expect(page).toHaveURL(/\/today$/);
  expect(
    (await (await page.request.get("/api/export")).json()).weeks,
  ).toHaveLength(1);
});
