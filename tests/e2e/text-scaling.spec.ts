import { test, expect, type Page } from "@playwright/test";

const routes = ["/", "/today", "/reflect/conversation", "/settings/reminders"];

async function noHorizontalScroll(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

// Returns every word in site chrome (header, nav, footer) that is split
// across more than one line.
async function splitWords(page: Page) {
  return page.evaluate(() => {
    const roots = document.querySelectorAll(
      "header, nav, footer, header *, nav *, footer *",
    );
    const broken: string[] = [];
    const seen = new Set<Node>();
    for (const el of Array.from(roots)) {
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || seen.has(node)) continue;
        seen.add(node);
        const text = node.textContent ?? "";
        for (const m of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, m.index ?? 0);
          range.setEnd(node, (m.index ?? 0) + m[0].length);
          const tops = new Set(
            Array.from(range.getClientRects())
              .filter((r) => r.width > 0)
              .map((r) => Math.round(r.top / 4)),
          );
          if (tops.size > 1) broken.push(m[0]);
        }
      }
    }
    return broken;
  });
}

for (const route of routes) {
  test(`200% text size at 320px keeps chrome words whole: ${route}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(route);
    const probe = () =>
      page.evaluate(() => {
        const size = (sel: string) => {
          const el = document.querySelector(sel);
          return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
        };
        return {
          body: size("body"),
          nav: size("nav a"),
          footer: size("footer"),
          help: size("header a:last-of-type"),
        };
      });
    const base = await probe();
    await page.addStyleTag({ content: "html{font-size:200%}" });
    const scaled = await probe();

    // (c) rem scaling: every probed size doubles with the root size.
    for (const key of ["body", "nav", "footer", "help"] as const) {
      expect(base[key], key).toBeGreaterThan(0);
      expect(scaled[key], key).toBeCloseTo(base[key] * 2, 1);
    }

    // (a) no horizontal scroll.
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(1);

    // (b) no word in header, nav or footer is split across lines.
    expect(await splitWords(page)).toEqual([]);
  });
}
