import type { Download, Locator, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { test, expect } from "./guards";

// These are complete cross-feature journeys. Controls are reached with Tab and
// operated with keyboard events; locator.fill/click/selectOption do not stand
// in for keyboard navigation. A missing tab stop fails with the target name.
async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  for (let index = 0; index < 160; index++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error(
    `Control is not keyboard reachable: ${await target.evaluate((element) => element.outerHTML)}`,
  );
}

async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}

async function type(page: Page, label: string, value: string) {
  const target = page.getByLabel(label, { exact: true });
  await tabTo(page, target);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(value);
  await expect(target).toHaveValue(value);
}

async function select(page: Page, label: string, value: string) {
  const target = page.getByLabel(label, { exact: true });
  // Navigation can still be committing when the previous keypress resolves.
  // Wait for the actual control before taking a non-waiting option snapshot.
  await tabTo(page, target);
  const index = await target
    .locator("option")
    .evaluateAll(
      (options, wanted) =>
        options.findIndex(
          (option) => (option as HTMLOptionElement).value === wanted,
        ),
      value,
    );
  expect(index, `Missing option ${value} in ${label}`).toBeGreaterThanOrEqual(
    0,
  );
  await page.keyboard.press("Home");
  for (let count = 0; count < index; count++)
    await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(target).toHaveValue(value);
}

async function check(page: Page, label: string, wanted = true) {
  const target = page.getByLabel(label, { exact: true });
  await tabTo(page, target);
  if ((await target.isChecked()) !== wanted) await page.keyboard.press("Space");
  if (wanted) await expect(target).toBeChecked();
  else await expect(target).not.toBeChecked();
}

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const link = (page: Page, name: string) =>
  page.getByRole("link", { name, exact: true });
const help = (page: Page) =>
  page
    .getByRole("banner")
    .getByRole("link", { name: "Help & support", exact: true });

async function feature(page: Page, href: string) {
  await activate(page, link(page, "Review explorer"));
  await activate(page, page.locator(`main a[href="${href}"]`).first());
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
}

async function downloaded(download: Download) {
  const path = await download.path();
  if (!path) throw new Error("Expected a downloaded JSON file");
  return JSON.parse(await readFile(path, "utf8"));
}

test.describe("whole-product keyboard journeys", () => {
  test.setTimeout(120_000);

  test("journey 1: onboarding, smaller step, prediction, quiet reminder, partial report and weekly change", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await check(page, "I am reviewing this as an adult (18+)");
    await activate(page, button(page, "Continue"));
    await select(page, "Focus", "Enjoyment");
    await select(page, "Energy today", "steady");
    await activate(page, button(page, "Continue"));
    await select(page, "Country / region", "SG");
    await activate(page, button(page, "Open Today"));
    await expect(
      page.getByText("Today · Enjoyment", { exact: true }),
    ).toBeVisible();
    await activate(page, button(page, "Make it smaller"));
    await type(page, "Your step", "Read a short paragraph");
    await type(
      page,
      "What do you expect will happen? (optional)",
      "A paragraph may feel too much",
    );
    await activate(page, button(page, "Choose this step"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Read a short paragraph",
    );
    await activate(page, button(page, "Preview a reminder"));
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue(
      /step-\d+/,
    );
    await check(page, "Turn on a reminder preview");
    await select(page, "Timezone", "UTC");
    await select(page, "Preferred local hour", "23");
    await activate(page, button(page, "Update preview"));
    await expect(page.locator("#reminder-feedback")).toContainText(
      "Preview updated. No notifications will be sent.",
    );
    await expect(page.locator("[data-next-preview]")).toHaveAttribute(
      "datetime",
      "2026-10-26T08:00:00.000Z",
    );
    await activate(page, link(page, "Back to the step"));
    await select(page, "How it went", "Partly");
    await type(page, "What got in the way?", "Too many words at once");
    await type(
      page,
      "How did it compare with what you expected?",
      "One sentence was enough for now",
    );
    await activate(page, button(page, "Save how it went"));
    await expect(page.locator("#report-feedback")).toBeFocused();
    await type(page, "Smaller version", "Read one sentence");
    await activate(page, button(page, "Preview the change"));
    await activate(page, button(page, "Use this version"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Read one sentence",
    );
    await feature(page, "/reflect/review");
    await type(page, "What did it give you?", "A moment with a book");
    await select(page, "How much effort did it take?", "more");
    await select(page, "Was it useful?", "mixed");
    await select(page, "What next?", "shrink");
    await type(page, "Smaller version", "Read a few words");
    await activate(page, button(page, "Save the smaller version"));
    await expect(page.locator("#weekly-feedback")).toContainText(
      "smaller version is on Today",
    );
    await activate(page, link(page, "Open step"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Read a few words",
    );
    await expect(
      page.getByText("A paragraph may feel too much", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("One sentence was enough for now", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("How it went", { exact: true })).toHaveValue(
      "",
    );
    await activate(page, link(page, "Today"));
    await expect(page.locator(".dark-panel h2")).toHaveText("Read a few words");

    // Skipping and returning are real exits, without creating an overdue list.
    await activate(page, link(page, "Review explorer"));
    await select(page, "Fictional scenario", "returning after absence");
    await activate(page, link(page, "Today"));
    await expect(
      page.getByText("Welcome back. There is nothing to catch up on.", {
        exact: true,
      }),
    ).toBeVisible();
    await activate(page, button(page, "Not today"));
    await expect(
      page.getByRole("heading", {
        name: "You can leave it here.",
        exact: true,
      }),
    ).toBeVisible();
    await activate(page, button(page, "Show the suggestion again"));
    await expect(
      page.getByRole("button", { name: /^Choose this step/ }),
    ).toBeVisible();
  });

  test("journey 2: reflection, chosen step, explicitly approved memory, edit/delete and temporary mode", async ({
    page,
  }) => {
    await page.goto("/reflect/thoughts");
    await type(page, "Situation", "A fictional quiet afternoon");
    await activate(page, button(page, "Next"));
    await type(page, "Thought", "I would like a little time with a book");
    await activate(page, button(page, "Next"));
    await activate(page, button(page, "Skip"));
    await activate(page, button(page, "Finish reflection"));
    await expect(page.locator("#thoughts-saved")).toContainText(
      "Nothing was added to memory",
    );
    await type(page, "A step in your words", "Open a poetry book");
    await activate(page, button(page, "Open in the step planner"));
    await expect(page.getByLabel("Your step", { exact: true })).toHaveValue(
      "Open a poetry book",
    );
    await activate(page, button(page, "Choose this step"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Open a poetry book",
    );
    await feature(page, "/reflect/thoughts");
    await activate(
      page,
      page.locator("summary").filter({ hasText: "Keep a memory card" }),
    );
    await type(page, "Memory card", "A fictional poem by the window");
    await activate(page, button(page, "Keep this card"));
    await expect(page.locator("#thoughts\\.memory-status")).toContainText(
      "Memory card kept",
    );
    await feature(page, "/settings/memory");
    await expect(
      page.getByRole("heading", {
        name: "A fictional poem by the window",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Thought reflection/)).toBeVisible();
    await activate(page, button(page, "Edit card"));
    await type(page, "Edit card", "A fictional poem on the porch");
    await activate(page, button(page, "Save card changes"));
    await activate(page, link(page, "Today"));
    // The existing chosen step remains. Conversation displays the next optional suggestion.
    await feature(page, "/reflect/conversation");
    await activate(page, button(page, "Start"));
    await type(page, "Your words", "A fictional afternoon");
    await activate(page, button(page, "Continue the script"));
    await activate(page, button(page, "Yes, show a suggestion"));
    await expect(page.getByTestId("current-script-idea")).toContainText(
      "A fictional poem on the porch",
    );
    await feature(page, "/settings/memory");
    await activate(page, button(page, "Delete card"));
    await activate(page, button(page, "Yes, delete card"));
    await expect(
      page.getByRole("heading", {
        name: "A fictional poem on the porch",
        exact: true,
      }),
    ).toHaveCount(0);
    await feature(page, "/reflect/conversation");
    await expect(page.getByTestId("current-script-idea")).not.toContainText(
      "A fictional poem on the porch",
    );
    await feature(page, "/settings/memory");
    await check(page, "Temporary mode: don't keep or use memory cards");
    await type(page, "New card", "This must remain a draft");
    await expect(button(page, "Keep this card")).toBeDisabled();
    await expect(
      page.getByRole("heading", {
        name: "This must remain a draft",
        exact: true,
      }),
    ).toHaveCount(0);
    await activate(page, link(page, "Today"));
    await expect(
      page.getByRole("heading", { name: /This must remain a draft/ }),
    ).toHaveCount(0);
  });

  test("journey 3: contact draft/copy, no reply, another approach and factual care export", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/connect");
    await select(page, "Who feels safe to contact?", "person");
    await type(page, "Your message", "Hi Alex, would a short chat suit you?");
    await activate(page, button(page, "Copy message"));
    await expect(
      page.getByRole("status").filter({ hasText: "Copied. Nothing was sent." }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "Hi Alex, would a short chat suit you?",
    );
    await activate(
      page,
      page.locator("summary").filter({ hasText: "After you reach out" }),
    );
    await select(page, "How did it go?", "No reply");
    await activate(page, button(page, "Save how it went"));
    await expect(
      page.getByRole("heading", { name: "No reply", exact: true }),
    ).toBeVisible();
    await activate(page, button(page, "Try another approach"));
    await expect(
      page.getByLabel("Who feels safe to contact?", { exact: true }),
    ).toHaveValue("none");
    await activate(page, page.locator('main a[href="/help"]').first());
    await expect(
      page.getByLabel("Country / region", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Check locally before relying on this.", { exact: true }),
    ).toBeVisible();
    await select(page, "Country / region", "OTHER");
    await expect(
      page.getByRole("heading", {
        name: "No verified resource listed yet.",
        exact: true,
      }),
    ).toBeVisible();
    await activate(page, link(page, "Connect"));
    await activate(page, page.locator('main a[href="/connect/care"]').first());
    await check(page, "Check cost and access");
    await type(page, "Original notes", "Ask about service access and cost");
    await activate(page, button(page, "Use notes as starting summary"));
    await type(
      page,
      "Editable factual summary",
      "Ask about access, cost and a quiet appointment time",
    );
    await type(page, "Appointment questions", "What does access involve?");
    const pending = page.waitForEvent("download");
    await activate(page, button(page, "Export care preparation JSON"));
    const data = await downloaded(await pending);
    expect(data).toMatchObject({
      kind: "synthetic-care-preparation",
      originalNotes: "Ask about service access and cost",
      editedSummary: "Ask about access, cost and a quiet appointment time",
      questions: "What does access involve?",
      checklist: ["Check cost and access"],
    });
    expect(data).not.toHaveProperty("appointment");
    await expect(
      page.getByLabel("Original notes", { exact: true }),
    ).toHaveValue("Ask about service access and cost");
    await activate(page, link(page, "Today"));
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  });

  test("journey 4: journal, routine, timezone preview, history and export/delete/reset", async ({
    page,
    context,
  }) => {
    await page.goto("/reflect/journal");
    await select(page, "Energy right now", "steady");
    await type(
      page,
      "Note (optional)",
      "A fictional quiet evening with a book",
    );
    await activate(page, button(page, "Add to journal"));
    await expect(
      page.getByText("A fictional quiet evening with a book", { exact: true }),
    ).toBeVisible();
    await feature(page, "/steps/routines");
    await select(page, "Kind", "rest");
    await type(page, "Your routine", "Sit in a comfortable chair for a minute");
    await activate(page, button(page, "Choose this routine"));
    await activate(page, button(page, "Preview a reminder"));
    await check(page, "Turn on a reminder preview");
    await select(page, "Timezone", "Asia/Dhaka");
    await select(page, "Preferred local hour", "23");
    await activate(page, button(page, "Update preview"));
    await expect(page.locator("[data-next-preview]")).toHaveAttribute(
      "datetime",
      "2026-10-26T02:00:00.000Z",
    );
    await expect(
      page.getByText("Moved out of your quiet hours.", { exact: true }),
    ).toBeVisible();
    await activate(page, link(page, "Open step"));
    await select(page, "How it went", "Done");
    await activate(page, button(page, "Save how it went"));
    await expect(
      page.getByRole("region", { name: "Step history" }),
    ).toContainText("Done");
    await activate(page, button(page, "Pause step"));
    await activate(page, button(page, "Preview a reminder"));
    await expect(page.locator("[data-next-preview]")).toHaveCount(0);
    await activate(page, link(page, "Open step"));
    await activate(page, button(page, "Delete step"));
    await activate(page, button(page, "Yes, delete step"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "This step no longer exists.",
    );
    await feature(page, "/settings/privacy");
    const pending = page.waitForEvent("download");
    await activate(page, button(page, "Export session (JSON)"));
    const data = await downloaded(await pending);
    expect(data.data.journal[0].text).toBe(
      "A fictional quiet evening with a book",
    );
    expect(data.data.steps).toEqual([]);
    expect(data.data.reminders.enabled).toBe(false);
    const storage = await page.evaluate(async () => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      databases: await indexedDB.databases(),
      workers: await navigator.serviceWorker.getRegistrations(),
    }));
    expect(storage).toEqual({
      local: {},
      session: {},
      databases: [],
      workers: [],
    });
    expect(await context.cookies()).toEqual([]);
    await activate(page, button(page, "Delete session data"));
    await activate(page, button(page, "Yes, delete everything"));
    await expect(
      page.getByLabel("Suggestions on", { exact: true }),
    ).not.toBeChecked();
    await feature(page, "/reflect/journal");
    await expect(
      page.getByText("No notes yet. Your first one will appear here.", {
        exact: true,
      }),
    ).toBeVisible();
    await feature(page, "/settings/privacy");
    await activate(page, button(page, "Start over"));
    await activate(page, button(page, "Yes, start over"));
    await expect(
      page.getByLabel("Suggestions on", { exact: true }),
    ).toBeChecked();
  });

  test("journey 5: error recovery, every feature indexed, offline Help, paused coaching and plain view", async ({
    page,
  }) => {
    await page.goto("/reflect/conversation");
    await activate(page, button(page, "Start"));
    await type(page, "Your words", "Keep this draft through the preview error");
    await activate(page, button(page, "Preview an error (review)"));
    await expect(page.getByRole("status")).toContainText("Error preview");
    await activate(page, button(page, "Try again"));
    await expect(page.getByLabel("Your words", { exact: true })).toHaveValue(
      "Keep this draft through the preview error",
    );
    await activate(page, link(page, "Review explorer"));
    for (let id = 1; id <= 16; id++)
      await expect(
        page
          .locator("main a")
          .filter({ hasText: `F${String(id).padStart(2, "0")} /` }),
      ).toHaveCount(1);
    await select(page, "Fictional scenario", "provider offline");
    for (const href of [
      "/onboarding",
      "/today",
      "/steps",
      "/reflect/conversation",
      "/connect",
      "/settings/privacy",
    ]) {
      await feature(page, href);
      await activate(page, help(page));
      await expect(page).toHaveURL(/\/help$/);
      await expect(
        page.getByText(
          "Suggestions are off. Everything on this page still works.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(page.getByText("988", { exact: true })).toBeVisible();
    }
    await activate(page, link(page, "Review explorer"));
    await select(page, "Fictional scenario", "coaching paused");
    await feature(page, "/today");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ordinary coaching is paused.",
    );
    await expect(
      page.getByText(/UX preview; not a validated safety response/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Choose this step/ }),
    ).toHaveCount(0);
    await activate(page, help(page));
    await expect(page.getByText("988", { exact: true })).toBeVisible();
    await activate(page, link(page, "Review explorer"));
    await select(page, "Fictional scenario", "first visit");
    await feature(page, "/settings/appearance");
    await select(page, "Voice", "plain");
    await check(page, "Plain view");
    await check(page, "Reduce motion");
    await activate(page, link(page, "Today"));
    await expect(
      page.locator("[data-plain=true][data-motion=reduced][data-tone=plain]"),
    ).toBeVisible();
    await expect(page.locator("[data-mascot]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Choose an optional step.",
    );
  });
});
