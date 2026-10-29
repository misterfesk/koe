import { readCover } from "@/server/search/cover";
import { getViewer } from "@/server/viewer";

/** A cached article cover. Serves stored bytes only; never fetches. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const v = await getViewer();
  if (!v?.profile) return new Response(null, { status: 401 });
  const { key } = await params;
  const cover = await readCover(v.db, key);
  if (!cover) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(cover.data), {
    headers: {
      "Content-Type": cover.type,
      "Content-Length": String(cover.data.length),
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
