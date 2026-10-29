import "server-only";
import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { shelfCoverCache } from "../db/schema";
import { searchStubbed } from "./stub";

// Article covers: og:image fetched once, server-side, then served from Koe.
// Every hop is HTTPS, resolves only to public addresses, and the connection
// is pinned to the address that was checked, so DNS cannot change in between.

export const coverTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE = 1.5 * 1024 * 1024;
const MAX_HTML = 512 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

export const coverKey = (articleUrl: string) =>
  createHash("sha256").update(articleUrl).digest("hex").slice(0, 32);

export type Resolve = (host: string) => Promise<string[]>;
export type HopResponse = {
  status: number;
  header(name: string): string | undefined;
  body: AsyncIterable<Uint8Array>;
  close(): void;
};
/** One request to `url`, connecting only to `address`; never follows redirects. */
export type Hop = (
  url: URL,
  address: string,
  signal: AbortSignal,
) => Promise<HopResponse>;

const defaultResolve: Resolve = async (host) =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

const defaultHop: Hop = (url, address, signal) =>
  new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        signal,
        headers: { "user-agent": "Koe cover fetch", accept: "*/*" },
        // Pin the connection to the checked address; TLS still verifies the name.
        lookup: (_host, options, cb) =>
          options?.all
            ? cb(null, [{ address, family: isIP(address) }] as never)
            : cb(null, address, isIP(address)),
      },
      (res) =>
        resolve({
          status: res.statusCode ?? 0,
          header: (name) => {
            const v = res.headers[name.toLowerCase()];
            return Array.isArray(v) ? v[0] : v;
          },
          body: res,
          close: () => res.destroy(),
        }),
    );
    req.on("error", reject);
    req.end();
  });

function ipv4Blocked(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Private, loopback, link-local, metadata and other non-public addresses. */
export function addressBlocked(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Blocked(ip);
  if (kind !== 6) return true;
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = v6.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Blocked(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v6)) return true;
  return (
    v6.startsWith("::") || // unspecified, loopback, IPv4-compatible
    /^0*:0*:0*:0*:0*:0*:/.test(v6) ||
    /^f[cd]/.test(v6) || // unique local
    /^fe[89ab]/.test(v6) || // link-local
    /^ff/.test(v6) || // multicast
    /^fec0/.test(v6) ||
    v6.startsWith("64:ff9b:") || // NAT64 can reach IPv4 private ranges
    v6.startsWith("2001:db8:")
  );
}

class CoverRefused extends Error {}

/**
 * GET over HTTPS with at most 3 redirects, re-checking every hop. Returns the
 * final content type and body, or throws CoverRefused.
 */
export async function safeGet(
  raw: string,
  opts: { maxBytes: number; types: readonly string[]; partial?: boolean },
  deps: { resolve?: Resolve; hop?: Hop } = {},
): Promise<{ type: string; body: Buffer; url: string }> {
  const resolve = deps.resolve ?? defaultResolve;
  const hop = deps.hop ?? defaultHop;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CoverRefused("bad url");
  }
  for (let redirects = 0; ; redirects++) {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      throw new CoverRefused("not https");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (
      /^(localhost|metadata(\.google\.internal)?)$|\.local(host)?$/i.test(host)
    )
      throw new CoverRefused("blocked host");
    const addresses = isIP(host) ? [host] : await resolve(host);
    if (!addresses.length || addresses.some(addressBlocked))
      throw new CoverRefused("blocked address");
    const res = await hop(url, addresses[0], signal);
    if (res.status >= 300 && res.status < 400) {
      res.close();
      const location = res.header("location");
      if (!location || redirects >= MAX_REDIRECTS)
        throw new CoverRefused("redirects");
      url = new URL(location, url);
      continue;
    }
    if (res.status !== 200) {
      res.close();
      throw new CoverRefused("status");
    }
    const type = (res.header("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!opts.types.includes(type)) {
      res.close();
      throw new CoverRefused("type");
    }
    const declared = Number(res.header("content-length"));
    if (declared > opts.maxBytes && !opts.partial) {
      res.close();
      throw new CoverRefused("too large");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.byteLength;
      if (size > opts.maxBytes) {
        res.close();
        if (opts.partial) break;
        throw new CoverRefused("too large");
      }
      chunks.push(Buffer.from(chunk));
    }
    return { type, body: Buffer.concat(chunks), url: url.href };
  }
}

/** The og:image (or twitter:image) URL in an HTML head, resolved against the page. */
export function ogImage(html: string, base: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
    const prop = (attr("property") ?? attr("name") ?? "").toLowerCase();
    if (!["og:image", "og:image:secure_url", "twitter:image"].includes(prop))
      continue;
    const content = attr("content")?.replace(/&amp;/g, "&").trim();
    if (!content) continue;
    try {
      return new URL(content, base).href;
    } catch {
      continue;
    }
  }
  return null;
}

/** Magic bytes must agree with the declared type. */
function looksLike(type: string, b: Buffer) {
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8;
  if (type === "image/png")
    return b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  return (
    b.subarray(0, 4).toString("latin1") === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP"
  );
}

/** Fetches one article's cover. Null on any failure (the UI draws a cover). */
export async function fetchCover(
  articleUrl: string,
  deps: { resolve?: Resolve; hop?: Hop } = {},
): Promise<{ type: string; data: Buffer } | null> {
  try {
    const page = await safeGet(
      articleUrl,
      { maxBytes: MAX_HTML, types: ["text/html"], partial: true },
      deps,
    );
    const image = ogImage(page.body.toString("utf8"), page.url);
    if (!image) return null;
    const got = await safeGet(
      image,
      { maxBytes: MAX_IMAGE, types: coverTypes },
      deps,
    );
    return got.body.length && looksLike(got.type, got.body)
      ? { type: got.type, data: got.body }
      : null;
  } catch {
    return null;
  }
}

/** Fetches covers once per article URL; failures are stored as "none". */
export async function ensureCovers(
  db: Db,
  articleUrls: string[],
  deps: { resolve?: Resolve; hop?: Hop } = {},
) {
  const keys = new Map(articleUrls.map((u) => [coverKey(u), u]));
  if (!keys.size) return;
  const have = await db
    .select({ key: shelfCoverCache.key })
    .from(shelfCoverCache)
    .where(inArray(shelfCoverCache.key, [...keys.keys()]));
  for (const r of have) keys.delete(r.key);
  await Promise.allSettled(
    [...keys].map(async ([key, url]) => {
      // Stub mode is a local fixture: no network.
      const cover = searchStubbed() ? null : await fetchCover(url, deps);
      await db
        .insert(shelfCoverCache)
        .values({
          key,
          contentType: cover?.type ?? null,
          dataBase64: cover ? cover.data.toString("base64") : null,
        })
        .onConflictDoNothing();
    }),
  );
}

export async function readCover(db: Db, key: string) {
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  const [row] = await db
    .select()
    .from(shelfCoverCache)
    .where(eq(shelfCoverCache.key, key));
  return row?.dataBase64 &&
    coverTypes.includes(row.contentType as (typeof coverTypes)[number])
    ? { type: row.contentType!, data: Buffer.from(row.dataBase64, "base64") }
    : null;
}
