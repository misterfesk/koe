import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

const observations = new WeakMap<
  Page,
  { external: string[]; errors: string[] }
>();
test.beforeEach(({ page }) => {
  const current = { external: [] as string[], errors: [] as string[] };
  observations.set(page, current);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "127.0.0.1"
    )
      current.external.push(url.href);
  });
  page.on("pageerror", (error) => current.errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(observations.get(page)?.external).toEqual([]);
  expect(observations.get(page)?.errors).toEqual([]);
});

test("S4 conversation consent, explicit memory, plan and fresh deletion-aware ideas", async ({
  page,
}) => {
  await page.goto("/reflect/conversation");
  await expect(
    page.getByText(
      "Scripted preview. No live AI reads or responds to your words.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose this step", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start the script", exact: true })
    .click();
  await page
    .getByLabel("Your fictional words (optional)")
    .fill("A fictional day with little room.");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Help & support" })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await page.goBack();
  await expect(page.getByLabel("Your fictional words (optional)")).toHaveValue(
    "A fictional day with little room.",
  );
  await page
    .getByRole("button", { name: "Continue scripted exchange", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Would an idea be useful?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose this step", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Yes, show an idea", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose this step", exact: true })
    .click();
  await expect(page).toHaveURL(/\/steps\/step-\d+$/);
  await page.getByRole("link", { name: "Reflect", exact: true }).click();
  await page
    .getByRole("link", { name: "Scripted conversation", exact: true })
    .click();
  await page
    .getByText("Prepare a memory card (optional)", { exact: true })
    .click();
  await page
    .getByLabel("Optional memory in your words")
    .fill("Reading a fictional poem");
  await page
    .getByRole("button", { name: "Approve this memory card", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Inspect approved memory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Reading a fictional poem",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit card", exact: true }).click();
  await page.getByLabel("Edit memory card").fill("Reading a fictional line");
  await page
    .getByRole("button", { name: "Save card changes", exact: true })
    .click();
  const memoryDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export memory JSON", exact: true })
    .click();
  const memoryFile = await memoryDownload;
  expect(memoryFile.suggestedFilename()).toBe("koe-synthetic-memory.json");
  const memoryPath = await memoryFile.path();
  if (!memoryPath) throw new Error("Memory export did not produce a file");
  const exportedMemory = JSON.parse(await readFile(memoryPath, "utf8"));
  expect(exportedMemory.cards[0]).toMatchObject({
    text: "Reading a fictional line",
    source: "Scripted conversation: explicit wording",
    at: "2026-10-25T12:00:00.000Z",
  });
  await page
    .getByRole("link", { name: "Scripted conversation", exact: true })
    .click();
  await expect(page.getByTestId("current-script-idea")).toContainText(
    "Reading a fictional line",
  );
  await page
    .getByRole("link", { name: "Inspect approved memory", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Delete this memory card?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Yes, delete card", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Reading a fictional line",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Scripted conversation", exact: true })
    .click();
  await expect(page.getByTestId("current-script-idea")).not.toContainText(
    "Reading a fictional line",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `review-artifacts/s4/conversation-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("S4 thought draft, temporary memory permission, journal edit/delete/export and recovery", async ({
  page,
}) => {
  await page.goto("/reflect/thoughts");
  await page
    .getByLabel("Situation (optional)")
    .fill("A fictional delayed train");
  await page.getByRole("button", { name: "Next prompt", exact: true }).click();
  await page
    .getByLabel("Thought (optional)")
    .fill("This delay is inconvenient");
  await page
    .getByRole("button", { name: "Skip this prompt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skip this prompt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish reflection", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Reflection finished" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Reflection finished" }),
  ).toBeFocused();
  await page
    .getByLabel("An optional step in your words")
    .fill("Read a fictional timetable");
  await page
    .getByRole("button", { name: "Bring this step to planner", exact: true })
    .click();
  await expect(page).toHaveURL(/\/steps\/new$/);
  await expect(page.getByLabel("Your step")).toHaveValue(
    "Read a fictional timetable",
  );
  await page.getByRole("link", { name: "Reflect", exact: true }).click();
  await page
    .getByRole("link", { name: "Thought reflection", exact: true })
    .click();
  await page
    .getByLabel("An optional step in your words")
    .fill("A different proposed action");
  await page
    .getByRole("button", { name: "Bring this step to planner", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "A planner draft is already open",
  );
  await expect(
    page.getByRole("link", {
      name: "Inspect existing planner draft",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Approved memory", exact: true })
    .click();
  await page
    .getByLabel("Temporary mode: do not create or retrieve memory")
    .check();
  await page.getByLabel("New memory card").fill("Must remain unapproved");
  await expect(
    page.getByRole("button", { name: "Approve new memory", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Energy & journal", exact: true })
    .click();
  await page.getByLabel("Energy for this note").selectOption("low");
  await page
    .getByLabel("Fictional journal note (optional)")
    .fill("A fictional quiet afternoon");
  await page
    .getByRole("button", { name: "Record energy / note", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit note", exact: true }).click();
  await page.getByLabel("Edit journal note").fill("A fictional quiet evening");
  await page
    .getByRole("button", { name: "Save note changes", exact: true })
    .click();
  await expect(
    page.getByText("A fictional quiet evening", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `review-artifacts/s4/journal-${test.info().project.name}.png`,
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export journal JSON", exact: true })
    .click();
  const journalFile = await download;
  expect(journalFile.suggestedFilename()).toBe("koe-synthetic-journal.json");
  const journalPath = await journalFile.path();
  if (!journalPath) throw new Error("Journal export did not produce a file");
  const exportedJournal = JSON.parse(await readFile(journalPath, "utf8"));
  expect(exportedJournal.notes[0]).toMatchObject({
    text: "A fictional quiet evening",
    energy: "low",
  });
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Delete this note?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Yes, delete note", exact: true })
    .click();
  await expect(
    page.getByText("No notes yet. Nothing needs to be tracked.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Scripted conversation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start the script", exact: true })
    .click();
  await page
    .getByLabel("Your fictional words (optional)")
    .fill("Keep this draft during an interruption");
  await page
    .getByRole("button", { name: "Preview interruption", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Error-state preview");
  await page
    .getByRole("button", { name: "Retry the script", exact: true })
    .click();
  await expect(page.getByLabel("Your fictional words (optional)")).toHaveValue(
    "Keep this draft during an interruption",
  );
  await page
    .getByRole("button", { name: "Cancel exchange", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You can leave it here.", exact: true }),
  ).toBeVisible();
});

test("S4 offline, revoked memory and paused coaching have explicit boundaries", async ({
  page,
}) => {
  await page.goto("/review");
  await page.getByLabel("Fictional scenario").selectOption("provider offline");
  await page.locator('main a[href="/reflect/conversation"]').click();
  await expect(
    page.getByRole("heading", {
      name: "This preview is offline.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Help & support" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start the script", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByLabel("Fictional scenario").selectOption("revoked consent");
  await page.locator('main a[href="/settings/memory"]').click();
  await expect(
    page.getByLabel("Allow approved memory in suggestions"),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Approve new memory", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Review explorer" }).click();
  await page.getByLabel("Fictional scenario").selectOption("coaching paused");
  await page.locator('main a[href="/reflect/conversation"]').click();
  await expect(
    page.getByRole("heading", {
      name: "Ordinary coaching is paused.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/UX preview; not a validated safety response/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start the script", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Reflect", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Scripted conversation", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Energy & journal", exact: true }),
  ).toBeVisible();
});
