import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  intakeDraftText,
  noHorizontalScroll,
  proposeInterview,
} from "./helpers";

/** Opens the welcome dialog and starts, stopping on the intake. */
async function startIntake(page: Page) {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Welcome to Koe" });
  await dialog.getByLabel("I'm 18 or older").check();
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/intake$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Plan your first day",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Help", exact: true }),
  ).toBeVisible();
}

async function clean(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${label}: ${v.id} (${v.nodes.length})`),
  ).toEqual([]);
  await noHorizontalScroll(page);
}

const chip = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const begin = (page: Page) =>
  page.getByRole("button", { name: "Start", exact: true }).click();
const skip = (page: Page) =>
  page.getByRole("button", { name: "Skip", exact: true }).click();

test("welcome, four chat turns, reveal and Start my day land on Today", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startIntake(page);
  await clean(page, "intro");
  await begin(page);

  // 1. Goals: up to two.
  await expect(heading(page, "What would help most right now?")).toBeFocused();
  await expect(page.getByText("1 of 4")).toBeVisible();
  await chip(page, "Energy and motivation").click();
  await chip(page, "Sleep").click();
  await expect(
    page.getByRole("button", { name: "Looking after the basics" }),
  ).toBeDisabled();
  await clean(page, "q1");
  await page.getByRole("button", { name: "Next" }).click();

  // 2. A usual day.
  await expect(heading(page, "What fills your days?")).toBeVisible();
  await expect(page.getByText("2 of 4")).toBeVisible();
  await chip(page, "Between 7 and 9").click();
  await chip(page, "Working").click();
  await clean(page, "q2");
  await page.getByRole("button", { name: "Next" }).click();

  // 3. What used to lift.
  await expect(heading(page, /What used to lift you/)).toBeVisible();
  await chip(page, "Music").click();
  await chip(page, "Walking").click();
  await page.getByRole("button", { name: /Something else/ }).click();
  await clean(page, "q3");
  await page.getByRole("button", { name: "Next" }).click();

  // 4. The weekly hand-off can be skipped with taps only.
  await expect(heading(page, /Tell me one thing/)).toBeVisible();
  await clean(page, "q4");
  // The server actions are slowed down, so the wait screen is on screen long
  // enough to be seen: it must show while the reveal is being made.
  let slowed = false;
  await page.route("**/*", async (route) => {
    if (!slowed && route.request().headers()["next-action"]) {
      slowed = true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(heading(page, "Getting to know you…")).toBeVisible();
  await expect(
    page.getByText("Putting your answers into a first day.", { exact: false }),
  ).toBeVisible();

  // The reveal.
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  await expect
    .poll(async () => {
      const title = await heading(
        page,
        "Here's what I understood",
      ).boundingBox();
      const header = await page.getByRole("banner").boundingBox();
      return !!title && !!header && title.y >= header.y + header.height;
    })
    .toBe(true);
  await expect(page.getByText("Here's a simple start")).toBeVisible();
  const morningChoices = page.getByRole("group", {
    name: "A morning plan time",
  });
  await expect(
    morningChoices.getByRole("button", { name: "Not now" }),
  ).toHaveAttribute("aria-pressed", "true");
  await morningChoices.getByRole("button", { name: "8:00 am" }).click();
  await expect(
    page.getByRole("checkbox", { name: /Remind me at 8:00 am/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /Remind me at the time/ }),
  ).not.toBeChecked();
  await clean(page, "reveal");
  const summary = page.getByLabel(/You can change this/);
  await expect(summary).toHaveValue(/^You/);
  const items = page.locator("ol li");
  await expect(items).toHaveCount(3);
  for (const li of await items.all()) {
    await expect(li.getByRole("heading", { level: 3 })).toBeVisible();
    await expect(li.getByText(/^Because/)).toBeVisible();
    await expect(li.locator(".eyebrow")).toHaveText(
      /^\d{1,2}:\d\d( [ap]m)? · (Tiny|Small)$/,
    );
  }
  const titles = await items
    .getByRole("heading", { level: 3 })
    .allTextContents();

  // Swap one item for another of the same kind.
  await items.first().getByRole("button", { name: /^Swap/ }).click();
  const swapped = await items
    .first()
    .getByRole("heading", { level: 3 })
    .textContent();
  expect(swapped).not.toBe(titles[0]);

  // Memory cards: visible, ticked, editable; untick one.
  const cards = page.getByRole("checkbox", { name: "Remember this" });
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toBeChecked();
  await expect(page.getByText("From your intro").first()).toBeVisible();
  await cards.nth(1).uncheck();
  const kept = await page.getByLabel("Memory 1").inputValue();

  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);

  expect(await intakeDraftText(page)).toBeNull();

  // Today shows the three items with their times and reasons.
  const today = page.getByRole("heading", { level: 3 });
  await expect(today).toHaveCount(3);
  await expect(page.getByText(/^Because/)).toHaveCount(3);
  await expect(
    page.getByRole("heading", { level: 3, name: swapped! }),
  ).toBeVisible();
  await page.reload();
  await expect(today).toHaveCount(3);
  await expect(
    page.getByRole("heading", { level: 3, name: swapped! }),
  ).toBeVisible();

  // Only the ticked memory was kept, with its source.
  await page.goto("/you/knows");
  await expect(page.locator("p", { hasText: kept })).toBeVisible();
  await expect(page.getByText("From your intro", { exact: true })).toHaveCount(
    1,
  );

  // Someone who has done the intro does not see it again.
  await page.goto("/intake");
  await expect(page).toHaveURL(/\/today$/);

  // The export has what Koe knows.
  const res = await page.request.get("/api/export");
  const body = await res.json();
  expect(body.userModel.model.lifts).toEqual(["music", "walking"]);
  expect(body.planDays).toHaveLength(1);
  expect(body.memoryCards).toHaveLength(1);
});

test("a risky answer shows the safety flow and the intake carries on", async ({
  page,
}) => {
  await startIntake(page);
  await begin(page);
  await chip(page, "Sleep").click();
  await page.getByRole("button", { name: /Something else/ }).click();
  await page.getByLabel("Your words").fill("I want to end it all");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByRole("heading", { name: /are you safe right now/ }),
  ).toBeFocused();
  await clean(page, "safety");
  await page.getByRole("button", { name: "I'm safe for now" }).click();
  await page.getByRole("button", { name: "Carry on with Koe" }).click();
  await expect(heading(page, "What fills your days?")).toBeVisible();
  // Back on the first question, the words are gone and the tick is kept.
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /Something else/ }).click();
  await expect(page.getByLabel("Your words")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Sleep" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("all questions skipped still gives a gentle first day", async ({
  page,
}) => {
  await startIntake(page);
  await begin(page);
  for (let n = 0; n < 4; n++) await skip(page);
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(3);
  // Removing items is allowed down to one.
  const remove = page.getByRole("button", { name: /^Remove/ });
  await remove.first().click();
  await remove.first().click();
  await expect(page.locator("ol li")).toHaveCount(1);
  await expect(remove.first()).toBeDisabled();
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
});

test("food and weight worry drops food and movement and points to Help", async ({
  page,
}) => {
  await startIntake(page);
  await begin(page);
  await page.getByRole("button", { name: /Something else/ }).click();
  await page
    .getByLabel("Your words")
    .fill("I hate my body and I'm restricting");
  await page.getByRole("button", { name: "Next" }).click();
  for (let n = 0; n < 3; n++) await skip(page);
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  await expect(
    page.getByText(/tell a doctor or someone you trust/),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Help", exact: true }),
  ).toBeVisible();
  const text = await page.locator("ol").innerText();
  expect(text).not.toMatch(/\b(eat|meal|food|walk|stretch|exercise)/i);
});

test("the questions work at 320px and by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await startIntake(page);
  await noHorizontalScroll(page);
  await begin(page);
  await noHorizontalScroll(page);
  // Enter in a text box moves on, like Next.
  await page.getByRole("button", { name: /Something else/ }).click();
  await page.getByLabel("Your words").fill("Just getting by");
  await page.getByLabel("Your words").press("Enter");
  await expect(heading(page, "What fills your days?")).toBeVisible();
  // Chips are real controls: Space picks one.
  await page.getByRole("button", { name: "Before 7" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Before 7" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await noHorizontalScroll(page);
  // One button: Next once something is answered, Skip when nothing is.
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
  await page.getByRole("button", { name: "Next" }).click();
  for (let n = 0; n < 2; n++) await skip(page);
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  await noHorizontalScroll(page);
  await clean(page, "reveal 320");
});

test("a reload picks up the intake where it was", async ({ page }) => {
  await startIntake(page);
  await begin(page);
  await chip(page, "Sleep").click();
  await page.getByRole("button", { name: /Something else/ }).click();
  await page.getByLabel("Your words").fill("Mornings are hard");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(heading(page, "What fills your days?")).toBeVisible();
  await chip(page, "Between 7 and 9").click();
  await page.reload();
  // Back on the second question, with the earlier answers kept.
  await expect(heading(page, "What fills your days?")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Between 7 and 9" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Sleep" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Your words")).toHaveValue("Mornings are hard");
  // Words that trip the safety check are never kept.
  await page.getByRole("button", { name: /Something else/ }).click();
  await page.getByLabel("Your words").fill("I want to end it all");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "I'm safe for now" }).click();
  await page.getByRole("button", { name: "Carry on with Koe" }).click();
  await page.reload();
  const kept = await intakeDraftText(page);
  expect(kept).not.toContain("end it all");
});

test("inline Other and weekly words reach a saved lean plan", async ({
  page,
}) => {
  await startIntake(page);
  await begin(page);
  await page.getByRole("button", { name: /Something else/ }).click();
  await page.getByLabel("Your words").fill("Starting the morning");
  await page.getByRole("button", { name: "Next" }).click();
  const days = page.getByRole("group", {
    name: "What fills your days?",
    exact: true,
  });
  await days.getByRole("button", { name: /Something else/ }).click();
  await days.getByLabel("Your words").fill("Freelance drawing");
  const wake = page.getByRole("group", { name: "Roughly when do you wake?" });
  await wake.getByRole("button", { name: /Something else/ }).click();
  await wake.getByLabel("Your words").fill("After night shifts");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(heading(page, "What used to lift you?")).toBeVisible();
  await page.getByRole("button", { name: /Something else/ }).click();
  await page.getByLabel("Your words").fill("Drawing cats");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Your answer").fill("Update my CV");
  await page.getByLabel("Your answer").press("Enter");
  await proposeInterview(page);
  await page.getByRole("button", { name: "Review your first day" }).click();
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  // The reveal's plan already shows the week thing, as Today will.
  const plan = page.getByRole("region", { name: "Today's plan" });
  await expect(
    plan.getByRole("heading", { level: 3, name: "Update my CV" }),
  ).toBeVisible();
  await expect(plan.getByText('Because you said "Update my CV"')).toBeVisible();
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);
  const body = await (await page.request.get("/api/export")).json();
  // Day 1 is the week thing plus one anchor from the intro plan.
  const day1 = body.planDays[0].items as {
    title: string;
    weekItemId?: string;
  }[];
  expect(day1.filter((i) => i.weekItemId).map((i) => i.title)).toEqual([
    "Update my CV",
  ]);
  expect(day1.filter((i) => !i.weekItemId)).toHaveLength(1);
  expect(body.userModel.model).toMatchObject({
    people: [],
    names: [],
    tone: "calm",
    notes: {
      goals: "Starting the morning",
      day: "Freelance drawing. Wake: After night shifts",
      lifts: "Drawing cats",
    },
  });
  expect(body.userModel.model.support).toBeUndefined();
  expect(body.userModel.model.puttingOff).toBeUndefined();
  expect(body.weeks[0].items[0].captured).toEqual({
    what: "Update my CV",
    when: "By the weekend",
    title: "Update my CV",
  });
  expect(
    body.memoryCards.some((card: { text: string }) =>
      /keep putting off/i.test(card.text),
    ),
  ).toBe(false);
  expect(await intakeDraftText(page)).toBeNull();
  await page.context().clearCookies();
  await startIntake(page);
  await begin(page);
  await expect(page.locator("button[aria-pressed=true]")).toHaveCount(0);
  await skip(page);
  await skip(page);
  await skip(page);
  await expect(page.getByLabel("Your answer")).toHaveValue("");
});

test("Back, Skip and exit preserve only answers the person keeps", async ({
  page,
}) => {
  await startIntake(page);
  await begin(page);
  await chip(page, "Sleep").click();
  await page.getByRole("button", { name: "Next" }).click();
  await chip(page, "Working").click();
  await page.getByRole("link", { name: "Leave for Today" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto("/intake");
  await expect(heading(page, "What fills your days?")).toBeVisible();
  await expect(chip(page, "Working")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Back" }).click();
  await chip(page, "Sleep").click();
  await skip(page);
  await chip(page, "Working").click();
  await skip(page);
  await skip(page);
  await skip(page);
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);
  const body = await (await page.request.get("/api/export")).json();
  expect(body.userModel.model.goals).toEqual([]);
  expect(body.userModel.model.days).toBeUndefined();
});

test("malformed and legacy drafts resume without hidden answers", async ({
  page,
}) => {
  await startIntake(page);
  await page.evaluate(() =>
    sessionStorage.setItem(
      Object.keys(sessionStorage).find((key) =>
        key.startsWith("koe.plan-draft:intake:"),
      )!,
      JSON.stringify({
        owner: JSON.parse(
          sessionStorage.getItem(
            Object.keys(sessionStorage).find((key) =>
              key.startsWith("koe.plan-draft:intake:"),
            )!,
          )!,
        ).owner,
        stage: 2,
        draft: {
          goals: "bad",
          days: {},
          wake: [null],
          lifts: "bad",
          names: "bad",
          people: ["friend"],
          tone: ["expressive"],
        },
      }),
    ),
  );
  await page.reload();
  await expect(heading(page, "What fills your days?")).toBeVisible();
  await skip(page);
  await skip(page);
  await skip(page);
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);
  const body = await (await page.request.get("/api/export")).json();
  expect(body.userModel.model).toMatchObject({
    people: [],
    names: [],
    tone: "calm",
  });
});

test("keyboard-only lean intake reaches Today", async ({ page }) => {
  await startIntake(page);
  async function activate(name: string | RegExp) {
    const target = page.getByRole("button", {
      name,
      exact: typeof name === "string",
    });
    for (let n = 0; n < 60; n++) {
      if (
        await target.evaluate((element) => element === document.activeElement)
      ) {
        await page.keyboard.press("Enter");
        return;
      }
      await page.keyboard.press("Tab");
    }
    throw new Error(`Could not reach ${name}`);
  }
  await activate("Start");
  await activate("Sleep");
  await activate("Next");
  await activate("Working");
  await activate("Before 7");
  await activate("Next");
  await activate("Music");
  await activate("Next");
  await activate("Skip");
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  await activate("Start my day");
  await expect(page).toHaveURL(/\/today$/);
});

test("a risky reveal edit preserves the intake draft", async ({ page }) => {
  await startIntake(page);
  await begin(page);
  await chip(page, "Sleep").click();
  await page.getByRole("button", { name: "Next" }).click();
  await skip(page);
  await skip(page);
  await skip(page);
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  const before = await intakeDraftText(page);
  expect(before).toContain("sleep");
  await page.getByLabel(/You can change this/).fill("I want to end it all");
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(
    page.getByRole("heading", { name: /are you safe right now/ }),
  ).toBeVisible();
  expect(await intakeDraftText(page)).toBe(before);
});

test("a failed Start my day request preserves the intake draft", async ({
  page,
}) => {
  await startIntake(page);
  await begin(page);
  for (let n = 0; n < 4; n++) await skip(page);
  await expect(heading(page, "Here's what I understood")).toBeVisible();
  const before = await intakeDraftText(page);
  expect(before).not.toBeNull();
  await page.route("**/intake", async (route) => {
    if (route.request().headers()["next-action"]) await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your day couldn't be confirmed." }),
  ).toBeVisible();
  expect(await intakeDraftText(page)).toBe(before);
  await expect(page).toHaveURL(/\/intake$/);
});
