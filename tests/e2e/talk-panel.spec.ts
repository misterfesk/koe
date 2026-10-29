import { expect, test, type Page } from "@playwright/test";
import { noHorizontalScroll, proposeInterview, startAsGuest } from "./helpers";

// Talk answers from a script here (KOE_AI_STUB, local servers only).
const desktop = { width: 1440, height: 1000 };

const opener = (page: Page) =>
  page.getByRole("banner").getByRole("button", { name: "Talk", exact: true });
const panel = (page: Page) => page.getByRole("dialog", { name: "Talk" });

test("the panel opens from Today and Shelf, and Today keeps its state", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await startAsGuest(page);
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByLabel(/words, if you like/i).fill("tired");

  await opener(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByText("Koe is an AI, not a person")).toBeVisible();
  await panel(page).getByRole("button", { name: "Close Talk" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByLabel(/words, if you like/i)).toHaveValue("tired");

  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Shelf" })
    .click();
  await expect(page).toHaveURL(/\/shelf$/);
  await opener(page).click();
  await expect(panel(page)).toBeVisible();
});

test("Escape closes the panel and focus returns to the Talk button", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await startAsGuest(page);
  await opener(page).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(opener(page)).toBeFocused();
});

test("History lists a conversation after a message is sent", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await startAsGuest(page);
  await opener(page).click();
  await panel(page)
    .getByRole("button", { name: "Show earlier conversations" })
    .click();
  await expect(panel(page).getByText("No conversations yet.")).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "Show earlier conversations" })
    .click();

  await panel(page).getByLabel("Your message").fill("hello there");
  await panel(page).getByRole("button", { name: "Send" }).click();
  await expect(panel(page).getByText("hello there")).toBeVisible();
  // The page behind did not navigate.
  await expect(page).toHaveURL(/\/today$/);

  await panel(page)
    .getByRole("button", { name: "Show earlier conversations" })
    .click();
  await expect(
    panel(page).getByRole("heading", { name: "History" }),
  ).toBeVisible();
  await expect(panel(page).getByRole("listitem")).toHaveCount(1);
});

test("the phone bar has five items with Talk in the centre, stays persistent when Talk is open, and More opens a sheet", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout");
  await startAsGuest(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/today");
    const bar = page.getByRole("navigation", { name: "Main navigation" });
    expect(await bar.locator("a, button").allInnerTexts()).toEqual([
      "Today",
      "Shelf",
      "Talk",
      "You",
      "More",
    ]);
    await noHorizontalScroll(page);

    await bar.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("link")).toHaveText([
      "Appointment",
      "Notes",
      "Look back",
      "People",
    ]);
    await noHorizontalScroll(page);
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);

    await bar.getByRole("button", { name: "Talk" }).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute("aria-modal", "true");
    // Bottom menu remains visible and unobstructed below the Talk panel
    await expect(bar).toBeVisible();
    const panelBox = await panel(page).boundingBox();
    const barBox = await bar.boundingBox();
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(barBox!.y + 1);
    await noHorizontalScroll(page);
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Talk" })).toBeFocused();
  }
});

test("Talk panel layout, quick-action pre-fill, Just talk hierarchy, tablet side-panel, and persistent mobile bottom menu at 1440, 768, and 375", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "runs all 3 viewports once");
  await page.setViewportSize({ width: 1440, height: 900 });
  await startAsGuest(page);

  // 1. Desktop (1440)
  await opener(page).click();
  await expect(panel(page)).toBeVisible();
  await noHorizontalScroll(page);

  const justTalk = panel(page).getByRole("button", { name: "Just talk" });
  const planStep = panel(page).getByRole("button", { name: "Plan a step" });
  const input = panel(page).getByLabel("Your message");
  const sendBtn = panel(page).getByRole("button", { name: "Send" });

  const panelBox1440 = await panel(page).boundingBox();
  const justTalkBox = await justTalk.boundingBox();
  const planStepBox = await planStep.boundingBox();
  const inputBox = await input.boundingBox();
  const sendBox = await sendBtn.boundingBox();

  expect(panelBox1440).not.toBeNull();
  expect(justTalkBox).not.toBeNull();
  expect(planStepBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(sendBox).not.toBeNull();

  // "Just talk" stands out above quick-action buttons in size and placement
  expect(justTalkBox!.y + justTalkBox!.height).toBeLessThanOrEqual(
    planStepBox!.y,
  );
  expect(justTalkBox!.height).toBeGreaterThan(planStepBox!.height);
  expect(justTalkBox!.width).toBeGreaterThan(planStepBox!.width);

  // Send icon button is on the right side of the input at the bottom of the panel
  expect(sendBox!.x).toBeGreaterThan(inputBox!.x);
  expect(
    panelBox1440!.y + panelBox1440!.height - (inputBox!.y + inputBox!.height),
  ).toBeLessThanOrEqual(32);

  const artifactDir =
    "<local path>";
  await page.screenshot({
    path: `${artifactDir}/talk-panel-desktop-1440.png`,
  });

  // Clicking "Plan a step" pre-fills the input with the template and lets the user keep typing
  await planStep.click();
  await expect(input).toHaveValue(
    "Help me with planning the following work - ",
  );
  await page.screenshot({
    path: `${artifactDir}/talk-panel-desktop-1440-prefilled.png`,
  });

  // Reset back to "Just talk"
  await justTalk.click();
  await expect(input).toHaveValue("");

  // 2. Tablet (768): right-side panel (not full-screen modal), persistent bottom menu visible
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(panel(page)).toBeVisible();
  await expect(opener(page)).toBeVisible();
  await expect(panel(page)).not.toHaveAttribute("aria-modal", "true");
  await noHorizontalScroll(page);
  const panelBox768 = await panel(page).boundingBox();
  const inputBox768 = await input.boundingBox();
  const sendBox768 = await sendBtn.boundingBox();
  const bar768 = page.getByRole("navigation", { name: "Main navigation" });
  const barBox768 = await bar768.boundingBox();
  expect(panelBox768!.x).toBeGreaterThan(300);
  expect(panelBox768!.width).toBe(380);
  expect(sendBox768!.x).toBeGreaterThan(inputBox768!.x);
  expect(
    panelBox768!.y +
      panelBox768!.height -
      (inputBox768!.y + inputBox768!.height),
  ).toBeLessThanOrEqual(32);
  expect(panelBox768!.y + panelBox768!.height).toBeLessThanOrEqual(
    barBox768!.y + 1,
  );
  await page.screenshot({
    path: `${artifactDir}/talk-panel-tablet-768.png`,
  });

  // 3. Mobile (375): persistent bottom menu remains visible below the chat panel
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("aria-modal", "true");
  await noHorizontalScroll(page);
  const bar375 = page.getByRole("navigation", { name: "Main navigation" });
  await expect(bar375).toBeVisible();
  const panelBox375 = await panel(page).boundingBox();
  const barBox375 = await bar375.boundingBox();
  const inputBox375 = await input.boundingBox();
  const sendBox375 = await sendBtn.boundingBox();
  expect(sendBox375!.x).toBeGreaterThan(inputBox375!.x);
  expect(
    panelBox375!.y +
      panelBox375!.height -
      (inputBox375!.y + inputBox375!.height),
  ).toBeLessThanOrEqual(32);
  expect(panelBox375!.y + panelBox375!.height).toBeLessThanOrEqual(
    barBox375!.y + 1,
  );
  await page.screenshot({
    path: `${artifactDir}/talk-panel-mobile-375.png`,
  });

  // Tapping Shelf in the persistent bottom menu on mobile closes Talk and navigates to /shelf
  await bar375.getByRole("link", { name: "Shelf" }).click();
  await expect(page).toHaveURL(/\/shelf$/);
  await expect(panel(page)).toHaveCount(0);
});

test("Stuck? Ask Koe opens Talk on a This week thing; Close leaves a takeaway in History", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize(desktop);
  await startAsGuest(page);
  await page.goto("/intake");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let n = 0; n < 4; n++)
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole("link", { name: /Tell Koe one thing/ }).click();
  await page.getByLabel("Your answer").fill("Update the CV");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await proposeInterview(page);
  await page
    .getByRole("button", { name: "Save this week", exact: true })
    .click();
  await expect(page).toHaveURL(/\/today$/);
  // A check-in plans the day from the week.
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Update my day" }).click();
  await expect(
    page.getByRole("region", { name: "What changed" }),
  ).toBeVisible();

  const thing = page.locator("li", {
    has: page.getByRole("heading", { level: 3, name: "Update the CV" }),
  });
  await thing.getByRole("button", { name: "Stuck? Ask Koe →" }).click();
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByText(`What's getting in the way with "Update the CV"?`),
  ).toBeVisible();
  await expect(
    panel(page).getByText("Help me with this task: Update the CV"),
  ).toBeVisible();
  await expect(panel(page).getByText("Thinking…")).toHaveCount(0);
  await expect(
    panel(page).getByText(
      `What part of "Update the CV" feels hardest to start?`,
    ),
  ).toBeVisible();

  for (const said of ["I open it and close it", "the first line is hard"]) {
    await panel(page).getByLabel("Your message").fill(said);
    await panel(page).getByRole("button", { name: "Send" }).click();
    await expect(panel(page).getByText(said)).toBeVisible();
    await expect(panel(page).getByText("Thinking…")).toHaveCount(0);
  }
  await panel(page).getByRole("button", { name: "Close Talk" }).click();
  await expect(panel(page)).toHaveCount(0);

  await opener(page).click();
  await panel(page)
    .getByRole("button", { name: "Show earlier conversations" })
    .click();
  await expect(
    panel(page).getByText("You named what gets in the way."),
  ).toBeVisible();
});

test("Stuck? Ask Koe shows on every task card, auto-sends once on desktop (1440) and mobile (375), and avoids duplicates on double-tap or reopen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "runs both 1440 and 375 once");
  test.setTimeout(120_000);

  // 1. Desktop (1440): regular daily plan task cards (non-This-week)
  await page.setViewportSize({ width: 1440, height: 900 });
  await startAsGuest(page);
  await page.goto("/today");

  const cards = page.locator("ul li", {
    has: page.getByRole("heading", { level: 3 }),
  });
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(2);

  // Every task card has the "Stuck? Ask Koe →" text link
  for (let i = 0; i < count; i++) {
    const link = cards.nth(i).getByRole("button", { name: "Stuck? Ask Koe →" });
    await expect(link).toBeVisible();
    await expect(link).toHaveClass(/\btext\b/);
  }

  const firstCard = cards.nth(0);
  const firstTitle = (
    await firstCard.getByRole("heading", { level: 3 }).innerText()
  ).trim();
  const firstLink = firstCard.getByRole("button", { name: "Stuck? Ask Koe →" });

  // Double-tap the link on the first card
  await firstLink.dblclick();
  await expect(panel(page)).toBeVisible();
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    panel(page).getByText(`Help me with this task: ${firstTitle}`),
  ).toHaveCount(1);
  await expect(panel(page).getByText("Thinking…")).toHaveCount(0);
  await expect(
    panel(page).getByText(
      `What part of "${firstTitle}" feels hardest to start?`,
    ),
  ).toHaveCount(1);

  // Close and reopen via both the Talk button and the task link: still only sent once
  await panel(page).getByRole("button", { name: "Close Talk" }).click();
  await expect(panel(page)).toHaveCount(0);

  await opener(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByText(`Help me with this task: ${firstTitle}`),
  ).toHaveCount(1);
  await panel(page).getByRole("button", { name: "Close Talk" }).click();

  await firstLink.click();
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByText(`Help me with this task: ${firstTitle}`),
  ).toHaveCount(1);
  await panel(page).getByRole("button", { name: "Close Talk" }).click();

  // 2. Mobile (375): tapping the link on a second task card opens the mobile Talk sheet and sends once
  await page.setViewportSize({ width: 375, height: 812 });
  const secondCard = cards.nth(1);
  const secondTitle = (
    await secondCard.getByRole("heading", { level: 3 }).innerText()
  ).trim();
  const secondLink = secondCard.getByRole("button", {
    name: "Stuck? Ask Koe →",
  });
  await secondLink.scrollIntoViewIfNeeded();
  await secondLink.click();

  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("aria-modal", "true");
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    panel(page).getByText(`Help me with this task: ${secondTitle}`),
  ).toHaveCount(1);
  await expect(panel(page).getByText("Thinking…")).toHaveCount(0);
  await expect(
    panel(page).getByText(
      `What part of "${secondTitle}" feels hardest to start?`,
    ),
  ).toHaveCount(1);
});
