import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { entry, noHorizontalScroll, startAsGuest } from "./helpers";

// The server records pushes instead of sending them (KOE_PUSH_STUB), and the
// browser's push subscription is faked: headless Chrome has no push service.
test.use({ permissions: ["notifications"] });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const fake = {
      endpoint:
        "https://fcm.googleapis.com/fcm/send/e2e-" +
        Math.random().toString(36).slice(2),
      keys: { p256dh: "BP" + "x".repeat(40), auth: "auth-e2e-key" },
    };
    PushManager.prototype.subscribe = async () =>
      ({ toJSON: () => fake }) as unknown as PushSubscription;
    PushManager.prototype.getSubscription = async () => null;
  });
});

async function clean(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${label}: ${v.id} (${v.nodes.length})`),
  ).toEqual([]);
  await noHorizontalScroll(page);
}

/** Quiet hours would block a late test time, so they are switched off first. */
async function noQuietHours(page: Page) {
  await page.goto("/you/reminders");
  await page.getByLabel("Quiet from").fill("00:00");
  await page.getByLabel("until").fill("00:00");
  await page.getByRole("button", { name: "Save quiet hours" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
}

test("a reminder on an item: asked once, with a reason, then a test arrives", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startAsGuest(page);
  await noQuietHours(page);
  await page.goto("/today");

  // An entry of their own, late in the day so the time has not passed.
  await page.getByRole("button", { name: "Add something" }).click();
  await page.getByRole("button", { name: "Be kind to yourself" }).click();
  await page.getByLabel("What is it?").fill("Put on one song");
  await page.getByLabel("Time, if you have one").fill("23:59");
  await page.getByRole("button", { name: "Add to today" }).click();
  const card = entry(page, "Put on one song");
  await expect(card).toBeVisible();

  // Nothing is on by default, and nothing was asked yet.
  await expect(page.getByText(/^Reminder at/)).toHaveCount(0);
  await card
    .getByRole("button", { name: "Remind me about Put on one song" })
    .click();
  await expect(
    card.getByText("Your browser will ask to show notifications."),
  ).toBeVisible();
  await clean(page, "reminder explanation");
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card.getByText(/^Reminder at/)).toHaveCount(0);

  await card
    .getByRole("button", { name: "Remind me about Put on one song" })
    .click();
  await card.getByRole("button", { name: "Allow and remind me" }).click();
  await expect(card.getByText("Reminder at 11:59 pm")).toBeVisible();
  await expect(
    card.getByText("Reminders are on for this device."),
  ).toBeVisible();

  // The test arrives and says so plainly (never "Sent").
  await card.getByRole("button", { name: "Send a test now" }).click();
  await expect(
    card.getByText("Test on its way. Check your notifications."),
  ).toBeVisible();
  await expect(card.getByText(/\bSent\b/)).toHaveCount(0);

  // One quiet line on Today names the next one.
  await expect(
    page.getByText("Next reminder: 11:59 pm · Put on one song"),
  ).toBeVisible();
  await clean(page, "today with a reminder");

  // Swapping the item takes its reminder away, and says so.
  await card.getByRole("button", { name: "Not today" }).click();
  await card.getByRole("button", { name: "Swap for something else" }).click();
  const banner = page.getByRole("region", { name: "What changed" });
  await expect(banner).toContainText("Reminder removed with the old item.");
  await expect(page.getByText(/^Next reminder/)).toHaveCount(0);
  await expect(page.getByText(/^Reminder at/)).toHaveCount(0);

  // Undo brings the item, and its reminder, back.
  await banner.getByRole("button", { name: "Undo" }).click();
  await expect(
    entry(page, "Put on one song").getByText("Reminder at 11:59 pm"),
  ).toBeVisible();

  // Turn it off again from the same place.
  await entry(page, "Put on one song")
    .getByRole("button", { name: "Turn off the reminder for Put on one song" })
    .click();
  await expect(
    entry(page, "Put on one song").getByRole("button", {
      name: "Remind me about Put on one song",
    }),
  ).toBeVisible();
});

test("the morning plan reminder is off until turned on in You", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startAsGuest(page);
  await noQuietHours(page);
  await page.goto("/you/reminders");

  const toggle = page.getByLabel("Remind me when my day is ready");
  await expect(toggle).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Send a test now" }),
  ).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(
    page.getByText("Reminders are on for this device.").first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Send a test now" }).click();
  await expect(
    page.getByText("Test on its way. Check your notifications."),
  ).toBeVisible();
  await clean(page, "you reminders");

  await page.reload();
  await expect(page.getByLabel("Remind me when my day is ready")).toBeChecked();
  await expect(page.getByLabel("Time", { exact: true })).toHaveValue("08:00");
  await page.getByLabel("Remind me when my day is ready").click();
  await expect(
    page.getByLabel("Remind me when my day is ready"),
  ).not.toBeChecked();
  await expect(page.getByText(/\bsteps?\b/i)).toHaveCount(0);
});

test("nothing is on by default: a fresh device has no test button", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.goto("/you/reminders");
  await expect(
    page.getByRole("button", { name: "Turn on reminders" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send a test now" }),
  ).toHaveCount(0);
});

test("today as a calendar file, and one item as one", async ({
  page,
  playwright,
  baseURL,
}) => {
  await startAsGuest(page);
  const titles = await page
    .getByRole("heading", { level: 3 })
    .allTextContents();
  expect(titles).toHaveLength(3);

  const day = await page.request.get("/api/calendar/today");
  expect(day.status()).toBe(200);
  expect(day.headers()["content-type"]).toContain("text/calendar");
  const text = await day.text();
  expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  const escaped = (t: string) =>
    t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
  for (const t of titles) expect(text).toContain("SUMMARY:" + escaped(t));
  expect(text).toContain("From Koe");

  // The links are on Today.
  await expect(
    page.getByRole("link", { name: "Add today to your calendar" }),
  ).toBeVisible();
  const first = page.getByRole("link", { name: "Add to calendar" }).first();
  const href = (await first.getAttribute("href"))!;
  const one = await page.request.get(href);
  expect(one.status()).toBe(200);
  expect((await one.text()).match(/BEGIN:VEVENT/g)).toHaveLength(1);

  // Someone who is not signed in gets nothing, and another person's id gets nothing.
  const stranger = await playwright.request.newContext({ baseURL });
  expect((await stranger.get("/api/calendar/today")).status()).toBe(401);
  expect((await stranger.get(href)).status()).toBe(401);
  await stranger.dispose();
});
