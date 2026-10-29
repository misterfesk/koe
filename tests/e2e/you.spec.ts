import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { noHorizontalScroll, startAsGuest } from "./helpers";
async function capture(page: Page, name: string, project: string) {
  await mkdir("review-artifacts/s7b", { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `review-artifacts/s7b/${project}-${name}-390.png`,
    fullPage: true,
  });
}
test("every You section is reachable from the hub", async ({ page }, info) => {
  await startAsGuest(page);
  const sections = [
    ["What Koe knows", "What Koe knows"],
    ["People in your corner", "People in your corner"],
    ["Appointment", "Find appointment"],
    ["Look back", "Look back"],
    ["Notes", "Notes"],
    ["Reminders", "Reminders"],
    ["Your data", "Your data"],
    ["Account", "Make an account"],
    ["Appearance", "Appearance"],
    ["Place", "Place"],
  ];
  for (const [link, title] of sections) {
    await page.goto("/you");
    await page.getByRole("link", { name: new RegExp("^" + link + "") }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await noHorizontalScroll(page);
    if (["Appointment", "Your data", "Account"].includes(link))
      await capture(
        page,
        link.toLowerCase().replaceAll(" ", "-"),
        info.project.name,
      );
  }
  await capture(page, "place", info.project.name);
  await page.goto("/you");
  await capture(page, "hub", info.project.name);
});
test("saved information works without intake and remains editable with memory off", async ({
  page,
}, info) => {
  await startAsGuest(page);
  await page.goto("/you/knows");
  await page
    .getByLabel("Your summary", { exact: true })
    .fill("Quiet afternoons suit you.");
  await page.getByText("Your usual day", { exact: true }).click();
  await page.getByLabel("When do you usually wake?").selectOption("7to9");
  await page.getByLabel("More about your day").fill("Afternoons are quiet");
  await page.getByText("People and care", { exact: true }).click();
  await page.getByLabel("Name 1", { exact: true }).fill("Sam");
  await page
    .getByLabel("Are you seeing anyone for support?")
    .selectOption("doctor");
  await capture(page, "editor", info.project.name);
  await page.setViewportSize({ width: 320, height: 844 });
  await noHorizontalScroll(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `review-artifacts/s7b/${info.project.name}-editor-320.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Back to You", exact: true }).click();
  await page.getByRole("link", { name: /^What Koe knows/ }).click();
  await expect(page.getByLabel("Your summary", { exact: true })).toHaveValue(
    "Quiet afternoons suit you.",
  );
  await page
    .getByRole("button", { name: "Save your information", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your information is saved",
  );
  await capture(page, "saved", info.project.name);
  await page.reload();
  await expect(page.getByLabel("Your summary", { exact: true })).toHaveValue(
    "Quiet afternoons suit you.",
  );
  await page.getByRole("checkbox", { name: /Memory is on/ }).uncheck();
  await expect(
    page.getByRole("checkbox", { name: /Memory is off/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /Memory is off/ }),
  ).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Your summary", { exact: true })).toHaveValue(
    "Quiet afternoons suit you.",
  );
  await page
    .getByLabel("Your summary", { exact: true })
    .fill("Your edited summary.");
  await page
    .getByRole("button", { name: "Save your information", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your information is saved",
  );
  await capture(page, "memory-off", info.project.name);
  const data = await (await page.request.get("/api/export")).json();
  expect(data.userModel.summary).toBe("Your edited summary.");
  expect(data.userModel.model.notes.day).toBe("Afternoons are quiet");
  expect(data.userModel.model.names).toEqual([{ name: "Sam", save: false }]);
  expect(data.settings.memoryOn).toBe(false);
  expect(data.people).toEqual([]);
  expect(data.planDays.length).toBeGreaterThan(0);
  expect(data.shelf).toBeDefined();
  expect(data.shelfRefreshes).toBeDefined();
  await page.getByLabel("Your summary", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Save and clear words", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Clear these saved words?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  expect(
    (await (await page.request.get("/api/export")).json()).userModel.summary,
  ).toBe("Your edited summary.");
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((key) =>
      key.startsWith("koe.plan-draft:model:"),
    )!;
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    draft.version = 0;
    draft.summary = "Your earlier draft.";
    sessionStorage.setItem(key, JSON.stringify(draft));
  });
  await page.reload();
  await expect(page.getByLabel("Your summary", { exact: true })).toHaveValue(
    "Your edited summary.",
  );
  await expect(
    page.getByText(
      "Your saved information changed elsewhere. Your earlier draft stays in this tab.",
    ),
  ).toBeVisible();
  await capture(page, "earlier-draft", info.project.name);
  await page
    .getByRole("button", { name: "Use your earlier draft", exact: true })
    .click();
  await expect(page.getByLabel("Your summary", { exact: true })).toHaveValue(
    "Your earlier draft.",
  );
});
test("malformed drafts recover and deletion clears only this owner's drafts after success", async ({
  page,
}) => {
  await startAsGuest(page);
  await page.goto("/today/add");
  await page.getByLabel("What is it?").fill("Saved draft words");
  const keys = await page.evaluate(() => Object.keys(sessionStorage));
  const addKey = keys.find((k) => k.startsWith("koe.plan-draft:add:"))!;
  const owner = addKey.slice("koe.plan-draft:add:".length);
  await page.evaluate(
    ({ addKey, owner }) => {
      sessionStorage.setItem(addKey, "null");
      sessionStorage.setItem(
        `koe.plan-draft:problem:${owner}`,
        '{"stage":"plan","options":null}',
      );
      sessionStorage.setItem(
        `koe.plan-draft:reach-out:${owner}:person`,
        "private words",
      );
      sessionStorage.setItem(
        `koe.plan-draft:problem-plan:${owner}:opaque`,
        "private words",
      );
      sessionStorage.setItem("koe.intake.draft.v1", "private words");
      sessionStorage.setItem("koe.plan-draft:add:other", "other words");
      sessionStorage.setItem("unrelated", "keep");
    },
    { addKey, owner },
  );
  await page.reload();
  await expect(page.getByLabel("What is it?")).toHaveValue("");
  await page.goto("/today/problem");
  await expect(
    page.getByLabel("What's the problem?", { exact: true }),
  ).toBeVisible();
  await page.goto("/you/data");
  await page
    .getByRole("button", { name: "Delete everything", exact: true })
    .click();
  await expect(page.locator("p.error")).toContainText("Type DELETE");
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), addKey),
  ).not.toBeNull();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.route("**/you/data", async (route) => {
    if (route.request().method() === "POST") await route.abort();
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Delete everything", exact: true })
    .click();
  await expect(page.locator("p.error")).toContainText("could not be confirmed");
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), addKey),
  ).not.toBeNull();
  await page.unroute("**/you/data");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Delete everything", exact: true })
    .click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  const remaining = await page.evaluate(() => Object.keys(sessionStorage));
  expect(
    remaining.filter(
      (key) => key.includes(owner) || key === "koe.intake.draft.v1",
    ),
  ).toEqual([]);
  expect(remaining).toContain("unrelated");
  expect(remaining).toContain("koe.plan-draft:add:other");
  expect((await page.request.get("/api/export")).status()).toBe(401);
});

test("People placeholder, More Appointment link, two users with different needs, extra instructions, and responsive layouts (1440, 768, 375)", async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name !== "desktop", "runs all viewports once");
  await mkdir("review-artifacts/appointments-v3", { recursive: true });

  // User 1: default guest (low mood / sleep)
  await page.setViewportSize({ width: 1440, height: 900 });
  await startAsGuest(page);
  await page.goto("/you/notes");
  await page
    .getByLabel("Write a note")
    .fill("Trouble sleeping and waking up tired every night");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Navigate to People and check placeholder at 1440, 768, 375
  await page.goto("/you/people");
  await expect(
    page.getByText("Connecting helpful people, coming soon."),
  ).toBeVisible();
  await expect(page.locator("[data-people-parked] svg")).toBeVisible();

  for (const [w, h] of [
    [1440, 900],
    [768, 1024],
    [375, 812],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await noHorizontalScroll(page);
    await page.screenshot({
      path: `review-artifacts/appointments-v3/people-${w}.png`,
      fullPage: true,
    });
  }

  // Open Appointment via More on desktop (1440)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/today");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "More" }).click();
  await nav.getByRole("link", { name: "Appointment", exact: true }).click();
  await expect(page).toHaveURL(/\/you\/care$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Find appointment" }),
  ).toBeVisible();

  // Look up for User 1 (sleep & low mood)
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Results" }),
  ).toBeVisible();
  const user1Titles = await page.locator("h3").allInnerTexts();
  expect(user1Titles.join(" ")).toMatch(/sleep|talking therapies/i);
  await expect(
    page.getByRole("link", { name: /Go to link/i }).first(),
  ).toBeVisible();

  // Expand "Add instructions" and search for debt/money advice
  await page.getByText("Add instructions", { exact: true }).click();
  await page
    .getByLabel(
      "Add what kind of professional, subject or preference you want included.",
    )
    .fill("Free debt and money advice for bills");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: /Get free confidential debt and money advice/i,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByText(/Because you asked for "Free debt and money advice for bills"/)
      .first(),
  ).toBeVisible();

  // Check Appointment layout at 1440, 768, and 375
  for (const [w, h] of [
    [1440, 900],
    [768, 1024],
    [375, 812],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await noHorizontalScroll(page);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `review-artifacts/appointments-v3/appointment-${w}.png`,
      fullPage: true,
    });
  }

  // User 2: studying for SAT math exam (different context -> different results)
  const otherCtx = await browser.newContext({
    baseURL: new URL("/", page.url()).href,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page2 = await otherCtx.newPage();
    await startAsGuest(page2);
    await page2.goto("/you/notes");
    await page2
      .getByLabel("Write a note")
      .fill("Studying for my college algebra and math exam");
    await page2.getByRole("button", { name: "Save note" }).click();
    await expect(page2.getByText("Saved.")).toBeVisible();

    await page2.goto("/you/care");
    await page2.getByRole("button", { name: "Look up" }).click();
    await expect(
      page2.getByRole("heading", { level: 2, name: "Results" }),
    ).toBeVisible();
    const user2Titles = await page2.locator("h3").allInnerTexts();
    expect(user2Titles.join(" ")).toMatch(/tutoring|study support/i);
    expect(user2Titles[0]).not.toBe(user1Titles[0]);
  } finally {
    await otherCtx.close();
  }
});
