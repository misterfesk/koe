import { expect, test } from "@playwright/test";
import { firstEntryTitle, startAsGuest } from "./helpers";

test("a guest's steps move into a new account and survive sign-out", async ({
  page,
}, info) => {
  await startAsGuest(page);
  const title = await firstEntryTitle(page);
  await page.goto("/today/add");
  await page.getByLabel("What is it?").fill("Guest draft to keep");
  const guestDraftKey = await page.evaluate(() =>
    Object.keys(sessionStorage).find((k) =>
      k.startsWith("koe.plan-draft:add:"),
    )!,
  );
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`;

  await page.goto("/you/account");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-test-password");
  await expect(page.locator('input[name="draftHandoff"]')).toHaveValue(
    "browser",
  );
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), guestDraftKey),
  ).toBeNull();
  await page.goto("/today/add");
  await expect(page.getByLabel("What is it?")).toHaveValue(
    "Guest draft to keep",
  );
  await page.goto("/you/account");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-here");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p.error")).toContainText("don't match");
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", { level: 3, name: title }),
  ).toBeVisible();
});

test("memory cards can be added, exported and everything deleted", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.goto("/you/knows");
  await page
    .getByLabel("Add a card")
    .first()
    .fill("Short walks outside help me");
  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText("Short walks outside help me")).toBeVisible();

  await page.goto("/you/data");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download your data/ }).click();
  const file = await download;
  const body = await (await file.createReadStream()).toArray();
  const data = JSON.parse(Buffer.concat(body).toString("utf8"));
  expect(data.memoryCards[0].text).toBe("Short walks outside help me");

  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page.locator("p.error")).toContainText("Type DELETE");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/$/);
});
