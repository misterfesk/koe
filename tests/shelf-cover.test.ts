// @vitest-environment node
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import type { Hop, HopResponse } from "@/server/search/cover";

const fake = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/viewer", () => ({ getViewer: () => fake.current }));

const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(64, 1),
]);
const page = (image = "https://img.example.org/cover.png") =>
  `<html><head><meta property="og:image" content="${image}"></head></html>`;

function response(
  status: number,
  headers: Record<string, string>,
  body: Buffer | string = "",
): HopResponse {
  return {
    status,
    header: (n) => headers[n.toLowerCase()],
    body: Readable.from([Buffer.from(body)]),
    close: () => {},
  };
}
/** DNS and hops by host: a mocked network. */
function network(
  dns: Record<string, string[]>,
  routes: Record<string, HopResponse>,
) {
  const hop = vi.fn<Hop>(async (url) => {
    const r = routes[url.href];
    if (!r) throw new Error(`unexpected hop ${url.href}`);
    return r;
  });
  const resolve = vi.fn(async (host: string) => dns[host] ?? []);
  return { hop, resolve };
}
const html = (body = page()) =>
  response(200, { "content-type": "text/html; charset=utf-8" }, body);
const png = (body: Buffer = PNG, extra: Record<string, string> = {}) =>
  response(200, { "content-type": "image/png", ...extra }, body);
const publicDns = {
  "www.nhs.uk": ["93.184.216.34"],
  "img.example.org": ["93.184.216.35"],
};

describe("cover fetcher", () => {
  it("fetches an og:image over HTTPS from public addresses", async () => {
    const { fetchCover } = await import("@/server/search/cover");
    const net = network(publicDns, {
      "https://www.nhs.uk/a": html(),
      "https://img.example.org/cover.png": png(),
    });
    const got = await fetchCover("https://www.nhs.uk/a", net);
    expect(got?.type).toBe("image/png");
    expect(got?.data.equals(PNG)).toBe(true);
    // Every connection is pinned to the checked address.
    expect(net.hop.mock.calls.map((c) => c[1])).toEqual([
      "93.184.216.34",
      "93.184.216.35",
    ]);
  });
  it("refuses http, for the page and for the image", async () => {
    const { fetchCover } = await import("@/server/search/cover");
    const a = network(publicDns, {});
    expect(await fetchCover("http://www.nhs.uk/a", a)).toBeNull();
    expect(a.hop).not.toHaveBeenCalled();
    const b = network(publicDns, {
      "https://www.nhs.uk/a": html(page("http://img.example.org/cover.png")),
    });
    expect(await fetchCover("https://www.nhs.uk/a", b)).toBeNull();
    expect(b.hop).toHaveBeenCalledTimes(1);
  });
  it.each([
    "10.0.0.5",
    "127.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.0.1",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
  ])("refuses a host resolving to %s", async (ip) => {
    const { fetchCover } = await import("@/server/search/cover");
    const net = network({ "www.nhs.uk": ["93.184.216.34", ip] }, {});
    expect(await fetchCover("https://www.nhs.uk/a", net)).toBeNull();
    expect(net.hop).not.toHaveBeenCalled();
  });
  it("refuses IP-literal and localhost URLs without resolving", async () => {
    const { fetchCover } = await import("@/server/search/cover");
    for (const url of [
      "https://127.0.0.1/a",
      "https://[::1]/a",
      "https://localhost/a",
      "https://metadata.google.internal/a",
    ]) {
      const net = network({ localhost: ["93.184.216.34"] }, {});
      expect(await fetchCover(url, net)).toBeNull();
      expect(net.hop).not.toHaveBeenCalled();
    }
  });
  it("re-checks every redirect hop and refuses one to a private address", async () => {
    const { fetchCover } = await import("@/server/search/cover");
    const net = network(
      { ...publicDns, "inside.example.org": ["10.1.2.3"] },
      {
        "https://www.nhs.uk/a": response(302, {
          location: "https://inside.example.org/secret",
        }),
      },
    );
    expect(await fetchCover("https://www.nhs.uk/a", net)).toBeNull();
    expect(net.resolve).toHaveBeenCalledWith("inside.example.org");
    expect(net.hop).toHaveBeenCalledTimes(1);
  });
  it("refuses a redirect to http and more than 3 redirects", async () => {
    const { fetchCover } = await import("@/server/search/cover");
    const toHttp = network(publicDns, {
      "https://www.nhs.uk/a": response(301, {
        location: "http://www.nhs.uk/b",
      }),
    });
    expect(await fetchCover("https://www.nhs.uk/a", toHttp)).toBeNull();
    const routes: Record<string, HopResponse> = {};
    for (let i = 0; i < 5; i++)
      routes[`https://www.nhs.uk/${i}`] = response(302, {
        location: `/${i + 1}`,
      });
    const loop = network(publicDns, routes);
    expect(await fetchCover("https://www.nhs.uk/0", loop)).toBeNull();
    expect(loop.hop).toHaveBeenCalledTimes(4);
  });
  it("follows up to 3 redirects", async () => {
    const { fetchCover } = await import("@/server/search/cover");
    const net = network(publicDns, {
      "https://www.nhs.uk/0": response(302, { location: "/1" }),
      "https://www.nhs.uk/1": response(302, { location: "/2" }),
      "https://www.nhs.uk/2": response(302, { location: "/3" }),
      "https://www.nhs.uk/3": html(),
      "https://img.example.org/cover.png": png(),
    });
    expect(await fetchCover("https://www.nhs.uk/0", net)).not.toBeNull();
  });
  it.each(["image/svg+xml", "text/html", "image/gif", ""])(
    "refuses image content type %s",
    async (type) => {
      const { fetchCover } = await import("@/server/search/cover");
      const net = network(publicDns, {
        "https://www.nhs.uk/a": html(),
        "https://img.example.org/cover.png": response(
          200,
          { "content-type": type },
          PNG,
        ),
      });
      expect(await fetchCover("https://www.nhs.uk/a", net)).toBeNull();
    },
  );
  it("refuses bytes that do not match the declared type", async () => {
    const { fetchCover } = await import("@/server/search/cover");
    const net = network(publicDns, {
      "https://www.nhs.uk/a": html(),
      "https://img.example.org/cover.png": png(Buffer.from("<svg></svg>")),
    });
    expect(await fetchCover("https://www.nhs.uk/a", net)).toBeNull();
  });
  it("refuses oversize bodies, declared or streamed", async () => {
    const { fetchCover } = await import("@/server/search/cover");
    const big = Buffer.concat([PNG, Buffer.alloc(1.6 * 1024 * 1024)]);
    for (const image of [
      png(PNG, { "content-length": String(2 * 1024 * 1024) }),
      png(big),
    ]) {
      const net = network(publicDns, {
        "https://www.nhs.uk/a": html(),
        "https://img.example.org/cover.png": image,
      });
      expect(await fetchCover("https://www.nhs.uk/a", net)).toBeNull();
    }
  });
  it("blocks the private, loopback, link-local and metadata ranges", async () => {
    const { addressBlocked } = await import("@/server/search/cover");
    for (const ip of [
      "10.0.0.1",
      "127.0.0.2",
      "169.254.169.254",
      "::",
      "::ffff:7f00:1",
      "64:ff9b::a00:1",
      "not-an-ip",
    ])
      expect(addressBlocked(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "2606:4700::1111"])
      expect(addressBlocked(ip), ip).toBe(false);
  });
});

describe("cover cache and route", () => {
  let db: Db;
  beforeAll(async () => {
    const { openDb } = await import("@/server/db");
    db = await openDb("memory:");
    fake.current = { profile: {}, db };
  });
  afterAll(async () => {
    await db.$client.close();
  });
  it("stores an image once, stores none on failure, and serves only stored images", async () => {
    const { ensureCovers, coverKey } = await import("@/server/search/cover");
    const { shelfCoverCache } = await import("@/server/db/schema");
    const net = network(publicDns, {
      "https://www.nhs.uk/a": html(),
      "https://img.example.org/cover.png": png(),
    });
    await ensureCovers(
      db,
      ["https://www.nhs.uk/a", "http://www.nhs.uk/b"],
      net,
    );
    await ensureCovers(db, ["https://www.nhs.uk/a"], net);
    expect(net.hop).toHaveBeenCalledTimes(2);
    const rows = await db.select().from(shelfCoverCache);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.dataBase64 === null)).toHaveLength(1);
    const { GET } = await import("@/app/api/shelf/cover/[key]/route");
    const call = (key: string) =>
      GET(new Request("http://x"), { params: Promise.resolve({ key }) });
    const ok = await call(coverKey("https://www.nhs.uk/a"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await ok.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await call(coverKey("http://www.nhs.uk/b"))).status).toBe(404);
    expect((await call("../../etc")).status).toBe(404);
  });
});
