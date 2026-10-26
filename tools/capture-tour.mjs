/** Explicit screenshot generation. Run `node tools/capture-tour.mjs` after build.
 * Never called by check, build or tests. Uses fictional state in fresh contexts.
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(web, "docs", "tour");
const port = 3400;
const origin = `http://127.0.0.1:${port}`;

// Refuse to drive an unrelated server if this port is already occupied.
const probe = createServer();
await new Promise((ready, reject) => {
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(ready));
});

const server = spawn(
  process.execPath,
  [
    join(web, "node_modules", "next", "dist", "bin", "next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { cwd: web, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let serverExited = false;
let serverError;
let serverLog = "";
const exit = new Promise((done) =>
  server.once("exit", () => {
    serverExited = true;
    done();
  }),
);
server.on("error", (error) => {
  serverError = error;
});
for (const stream of [server.stdout, server.stderr])
  stream.on("data", (data) => {
    serverLog = (serverLog + data.toString()).slice(-8000);
  });

let browser;
const captured = [];
try {
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (serverExited)
      throw new Error(`Tour server exited before readiness.\n${serverLog}`);
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* Keep waiting while the child starts. */
    }
    await sleep(150);
  }
  if (!ready)
    throw new Error(`Tour server did not return HTTP 200.\n${serverLog}`);
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: name === "mobile",
      hasTouch: name === "mobile",
      reducedMotion: "reduce",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const outside = [];
    const errors = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        url.hostname !== "127.0.0.1"
      ) {
        outside.push(url.href);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const button = (label) =>
      page.getByRole("button", { name: label, exact: true });
    const link = (label) =>
      page.getByRole("link", { name: label, exact: true });
    async function feature(href) {
      await link("Review explorer").click();
      await page.locator(`main a[href="${href}"]`).first().click();
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    }
    async function shot(label) {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      const filename = `${label}-${name}.png`;
      await page.screenshot({
        path: join(output, filename),
        fullPage: true,
        animations: "disabled",
      });
      captured.push(filename);
      if (outside.length || errors.length)
        throw new Error(
          `Tour encountered a boundary or runtime error: ${JSON.stringify({ outside, errors })}`,
        );
      process.stdout.write(`Captured ${filename}\n`);
    }

    // One navigation begins each context. Internal links preserve the session.
    await page.goto(origin);
    await shot("01-landing");
    await link("Koe home").click();
    await page
      .getByLabel("Energy today", { exact: true })
      .selectOption("steady");
    await page.getByRole("button", { name: /^Choose this step/ }).click();
    await expect(page.locator(".dark-panel h2")).toHaveText(
      "Read one page of something you enjoy",
    );
    await shot("02-today-chosen");
    await page.getByRole("link", { name: /^Say how it went/ }).click();
    await page
      .getByLabel("How it went", { exact: true })
      .selectOption("Partly");
    await page
      .getByLabel("What got in the way?", { exact: true })
      .fill("A page was more than I wanted today.");
    await page
      .getByLabel("What was it like?", { exact: true })
      .fill("A few lines gave me a moment with a book.");
    await button("Save how it went").click();
    await page
      .getByLabel("Smaller version", { exact: true })
      .fill("Read one sentence of something I enjoy");
    await shot("03-step-report");

    await button("Preview a reminder").click();
    await page
      .getByLabel("Turn on a reminder preview", { exact: true })
      .check();
    await page
      .getByLabel("Timezone", { exact: true })
      .selectOption("Asia/Dhaka");
    await page
      .getByLabel("Preferred local hour", { exact: true })
      .selectOption("23");
    await button("Update preview").click();
    await expect(page.locator("[data-next-preview]")).toBeVisible();
    await shot("04-reminder-preview");

    await feature("/reflect/journal");
    await page
      .getByLabel("Energy right now", { exact: true })
      .selectOption("steady");
    await page
      .getByLabel("Note (optional)", { exact: true })
      .fill(
        "A quiet afternoon with a book. I would like to ask about care access and cost.",
      );
    await button("Add to journal").click();
    await expect(
      page.getByText(
        "A quiet afternoon with a book. I would like to ask about care access and cost.",
        { exact: true },
      ),
    ).toBeVisible();
    await shot("05-journal-history");

    await feature("/reflect/thoughts");
    await page
      .getByLabel("Situation", { exact: true })
      .fill("The afternoon was quiet.");
    await button("Next").click();
    await page
      .getByLabel("Thought", { exact: true })
      .fill("I would like a little time to myself.");
    await button("Next").click();
    await button("Skip").click();
    await page
      .getByLabel("Another perspective", { exact: true })
      .fill("A short pause can stay short.");
    await button("Finish reflection").click();
    await shot("06-thought-reflection");
    await page
      .locator("summary")
      .filter({ hasText: "Keep a memory card" })
      .click();
    await page
      .getByLabel("Memory card", { exact: true })
      .fill("Quiet reading by a window");
    await button("Keep this card").click();
    await feature("/settings/memory");
    await expect(
      page.getByRole("heading", {
        name: "Quiet reading by a window",
        exact: true,
      }),
    ).toBeVisible();
    await shot("07-memory");

    await feature("/reflect/conversation");
    await button("Start").click();
    await page
      .getByLabel("Your words", { exact: true })
      .fill("A small quiet moment would suit this afternoon.");
    await button("Continue the script").click();
    await button("Yes, show a suggestion").click();
    await expect(page.getByTestId("current-script-idea")).toContainText(
      "Quiet reading by a window",
    );
    await shot("08-scripted-conversation");

    await link("Connect").click();
    await page
      .getByLabel("Who feels safe to contact?", { exact: true })
      .selectOption("person");
    await page
      .getByLabel("Your message", { exact: true })
      .fill("Hi Alex, would a short chat suit you sometime this week?");
    await button("Copy message").click();
    await expect(
      page.getByRole("status").filter({ hasText: "Copied. Nothing was sent." }),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: "After you reach out" })
      .click();
    await page
      .getByLabel("How did it go?", { exact: true })
      .selectOption("No reply");
    await button("Save how it went").click();
    await expect(
      page.getByRole("heading", { name: "No reply", exact: true }),
    ).toBeVisible();
    await shot("09-connect-report");

    await page.locator('main a[href="/connect/care"]').first().click();
    await page.getByLabel("Check cost and access", { exact: true }).check();
    await page.getByLabel("Prepare a question", { exact: true }).check();
    await button("Use notes as starting summary").click();
    await page
      .getByLabel("Editable factual summary", { exact: true })
      .fill(
        "I would like information about care access, costs and the next steps. A quiet appointment time may suit me.",
      );
    await page
      .getByLabel("Appointment questions", { exact: true })
      .fill(
        "What does access involve?\nWhat costs should I expect?\nCan I ask for a quiet appointment time?",
      );
    await shot("10-care-preparation");

    await feature("/settings/appearance");
    await page.getByLabel("Voice", { exact: true }).selectOption("calm");
    await shot("11-appearance");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Help & support", exact: true })
      .click();
    await page
      .getByLabel("Country / region", { exact: true })
      .selectOption("SG");
    await expect(page.getByText("1767", { exact: true })).toBeVisible();
    await shot("12-help");
    await link("Review explorer").click();
    await shot("13-review-explorer");

    await feature("/steps/routines");
    await page.getByLabel("Kind", { exact: true }).selectOption("rest");
    await page
      .getByLabel("Your routine", { exact: true })
      .fill("Put one optional evening task aside");
    await button("Choose this routine").click();
    await feature("/steps/routines");
    await shot("14-routines");
    await feature("/settings/privacy");
    await shot("15-your-data");
    await link("Steps").click();
    await shot("16-steps");
    await link("Reflect").click();
    await shot("17-reflect");
    await feature("/settings/appearance");
    await page.getByLabel("Voice", { exact: true }).selectOption("plain");
    await page.getByLabel("Plain view", { exact: true }).check();
    await page.getByLabel("Reduce motion", { exact: true }).check();
    await link("Today").click();
    await expect(page.locator("[data-mascot]")).toHaveCount(0);
    await shot("18-plain-today");
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  }
  process.stdout.write(
    `Tour complete: ${captured.length} screenshots in ${output}\n`,
  );
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    if (!serverExited) {
      server.kill("SIGTERM");
      await Promise.race([exit, sleep(5000)]);
      if (!serverExited) {
        server.kill("SIGKILL");
        await exit;
      }
    }
  }
}
