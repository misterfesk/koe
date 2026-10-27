import { expect, test } from "@playwright/test";
import { entry, firstEntryTitle, startAsGuest } from "./helpers";

test("setup can't be finished without confirming 18+", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Welcome to Koe" });
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog.locator("p.error")).toContainText("18 or older");
  await expect(page).toHaveURL(/\/$/);
  // App pages send people without a session back to the welcome dialog.
  await page.goto("/today");
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog).toBeVisible();
});

test("a new visitor starts in the welcome dialog, then skips the intake", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Welcome to Koe" });
  await expect(dialog).toBeVisible();
  // Focus starts at the heading, not on the Close button.
  await expect(
    dialog.getByRole("heading", { name: "Welcome to Koe" }),
  ).toBeFocused();
  // Esc returns to the landing page; the button brings the dialog back.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /Start now/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("I'm 18 or older").check();
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/intake$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Five questions so Koe can plan your day",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test("each tab and Help are reachable and show their page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startAsGuest(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const [tab, url, heading] of [
    ["Talk", /\/talk$/, "Talk it through"],
    ["Shelf", /\/shelf$/, "Shelf"],
    ["You", /\/you$/, "You"],
    ["Today", /\/today$/, /./],
  ] as const) {
    await nav.getByRole("link", { name: tab }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(nav.getByRole("link", { name: tab })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await page.getByRole("link", { name: "Help", exact: true }).click();
  await expect(page).toHaveURL(/\/help/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("old addresses go to the new ones", async ({ page }) => {
  await startAsGuest(page);
  for (const [from, to] of [
    ["/reflect", /\/talk$/],
    ["/reflect/talk", /\/talk$/],
    ["/connect", /\/you\/people$/],
    ["/settings", /\/you$/],
    ["/settings/memory", /\/you\/knows$/],
    ["/steps", /\/today$/],
    ["/start", /\/today$/],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
});

test("an answer on Today is still there after a reload", async ({ page }) => {
  await startAsGuest(page);
  // Skipping the intake still gives a day: it is planned when Today opens.
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  const title = await firstEntryTitle(page);

  const card = entry(page, title);
  await card.getByRole("button", { name: "Done" }).click();
  await card.getByRole("button", { name: "About the same" }).click();
  await expect(card.getByRole("status")).toContainText(
    "Done · About what you expected",
  );

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 3, name: title }),
  ).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText("Done");

  await page.goto("/you/look-back/journey");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("an answer can be undone, and Partly is its own answer", async ({
  page,
}) => {
  await startAsGuest(page);
  const title = await firstEntryTitle(page);
  const card = entry(page, title);
  await card.getByRole("button", { name: "Partly" }).click();
  await expect(card.getByRole("status")).toContainText("Partly");
  await card.getByRole("button", { name: "Undo" }).click();
  await expect(card.getByRole("button", { name: "Done" })).toBeVisible();
});

test("plan a repeating step with an if-then cue", async ({ page }) => {
  await startAsGuest(page);
  await page.goto("/steps/new");
  await page.getByRole("button", { name: "Get something done" }).click();
  await page.getByLabel("Your step").fill("Water the plants");
  await page.getByRole("button", { name: "After breakfast" }).click();
  await page.getByRole("button", { name: "Repeat on days…" }).click();
  await page.getByRole("button", { name: "Choose this step" }).click();
  await expect(page.locator("p.error")).toContainText("Pick at least one day");
  await page.getByText("Sat", { exact: true }).click();
  await page.getByRole("button", { name: "Choose this step" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Water the plants" }),
  ).toBeVisible();
  await expect(page.getByText("When: After breakfast")).toBeVisible();

  await page.goto("/steps");
  await expect(page).toHaveURL(/\/today$/);
});

test("problem solving ends in a planned step", async ({ page }) => {
  await startAsGuest(page);
  await page.goto("/steps/problem");
  await page.getByLabel("What's the problem?").fill("I keep missing my bus");
  await page.getByRole("button", { name: "Next: options" }).click();
  await page.getByLabel("Option 1").fill("Set an alarm 10 minutes earlier");
  await page.getByLabel("Option 2").fill("Lay out clothes the night before");
  await page.getByRole("button", { name: "Next: choose one" }).click();
  await page.getByText("Lay out clothes the night before").click();
  await page.getByRole("button", { name: "Next: plan it" }).click();
  await page.getByRole("button", { name: "Choose this step" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Lay out clothes the night before",
    }),
  ).toBeVisible();
  await expect(page.getByText("I keep missing my bus")).toBeVisible();
});

test("a worrying note gets the safety check and pauses coaching until resumed", async ({
  page,
}) => {
  await startAsGuest(page, "GB");
  await page.goto("/you/notes");
  await page.getByLabel("Write a note").fill("I just want to disappear");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(
    page.getByRole("heading", { name: /are you safe right now/ }),
  ).toBeVisible();
  // No warm completion line after something alarming.
  await expect(page.getByText("Nicely done")).toHaveCount(0);

  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: /are you safe/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I'm not safe" }).click();
  await expect(
    page.getByRole("link", { name: /Call emergency services: 999/ }),
  ).toHaveAttribute("href", "tel:999");
  await expect(
    page.getByRole("link", { name: "Call 116 123" }),
  ).toHaveAttribute("href", "tel:116123");
  await page.goto("/today");
  await page.getByRole("button", { name: "I'm safe for now" }).click();
  await page.getByRole("button", { name: "Carry on with Koe" }).click();
  await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
});

test("Talk saves the conversation even when the AI is off", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.goto("/talk");
  await expect(page.getByText("Koe is an AI, not a person")).toBeVisible();
  await page.getByLabel("Your message").fill("Work has been a lot this week");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page).toHaveURL(/\/talk\/.+/);
  await expect(
    page
      .getByRole("list", { name: "Conversation" })
      .getByText("Work has been a lot this week"),
  ).toBeVisible();
  await page.goto("/talk");
  await expect(
    page.getByRole("link", { name: "Work has been a lot this week" }),
  ).toBeVisible();
});

test("a risky message in Talk is never answered by the model", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.goto("/talk");
  await page
    .getByLabel("Your message")
    .fill("they would be better off without me");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByRole("heading", { name: /are you safe right now/ }),
  ).toBeVisible();
  await expect(
    page.getByText("the usual conversation is paused"),
  ).toBeVisible();
  await expect(page.getByLabel("Your message")).toHaveCount(0);

  // A new conversation is no way around the pause, and no dead end either.
  await page.goto("/talk");
  await expect(
    page.getByRole("heading", { name: /are you safe right now/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I'm safe for now" }).click();
  await page.getByRole("button", { name: "Carry on with Koe" }).click();
  await expect(page.getByLabel("Your message")).toBeVisible();
});

test("Help works signed out, with tap-to-call", async ({ page }) => {
  await page.goto("/help?region=SG");
  await expect(page.getByRole("link", { name: "Call 1767" })).toHaveAttribute(
    "href",
    "tel:1767",
  );
  await page.getByLabel("Country / region").selectOption("AU");
  await expect(page.getByRole("link", { name: "Call 13 11 14" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Call 000/ })).toHaveAttribute(
    "href",
    "tel:000",
  );
});
