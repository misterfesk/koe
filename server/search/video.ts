import "server-only";
import { z } from "zod";
import { channelForAuthorUrl, videoUrl } from "@/domain/sources";
import { searchStubbed, stubVideo } from "./stub";

const oembedSchema = z.object({
  author_url: z.string().max(200),
  title: z.string().max(400).optional(),
});

/**
 * Asks YouTube's keyless oEmbed endpoint who published a video. Returns the
 * allowlisted channel's author_url, or null for any other channel or failure.
 * The request carries only the public video URL.
 */
export async function allowlistedChannel(
  videoId: string,
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  if (searchStubbed())
    return videoId === stubVideo.id ? stubVideo.authorUrl : null;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl(videoId))}&format=json`,
      { redirect: "error", signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 20_000) return null;
    const data = oembedSchema.parse(JSON.parse(text));
    return channelForAuthorUrl(data.author_url)?.authorUrl ?? null;
  } catch {
    return null;
  }
}
