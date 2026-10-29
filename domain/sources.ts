export const sources = [
  { host: "www.nhs.uk", name: "NHS", region: "GB", termsChecked: false },
  { host: "www.mind.org.uk", name: "Mind", region: "GB", termsChecked: true },
  {
    host: "www.helpguide.org",
    name: "HelpGuide",
    region: "global",
    termsChecked: true,
  },
  {
    host: "www.cci.health.wa.gov.au",
    name: "Centre for Clinical Interventions",
    region: "AU",
    termsChecked: true,
  },
  {
    host: "www.nimh.nih.gov",
    name: "National Institute of Mental Health",
    region: "US",
    termsChecked: false,
  },
  {
    host: "medlineplus.gov",
    name: "MedlinePlus",
    region: "US",
    termsChecked: false,
  },
  {
    host: "www.healthdirect.gov.au",
    name: "healthdirect",
    region: "AU",
    termsChecked: false,
  },
] as const;

export function orderedSources(region?: string | null) {
  const rank = (r: string) => (r === region ? 0 : r === "global" ? 1 : 2);
  return [...sources].sort((a, b) => rank(a.region) - rank(b.region));
}

/** URL credentials, alternate ports and subdomains never inherit trust. */
export function sourceForUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    return sources.find((s) => s.host === u.hostname) ?? null;
  } catch {
    return null;
  }
}

/**
 * YouTube channels whose videos the Shelf may show. A video is kept only when
 * YouTube's oEmbed `author_url` for it matches one of these exactly.
 *
 * Checked 2026-10-28: each handle's channel page was fetched (title, links to
 * the organisation's own site) and the oEmbed of one of its videos returned
 * this exact author_url. Dropped as unverifiable: MedlinePlus (no channel of
 * its own; the NLM channel is a different publisher) and HelpGuide (the
 * channels found had no tie to helpguide.org).
 */
export const videoChannels = [
  { authorUrl: "https://www.youtube.com/@NHS", name: "NHS" },
  {
    authorUrl: "https://www.youtube.com/@MindMentalHealthCharity",
    name: "Mind",
  },
  { authorUrl: "https://www.youtube.com/@TEDEd", name: "TED-Ed" },
  { authorUrl: "https://www.youtube.com/@TED", name: "TED" },
  { authorUrl: "https://www.youtube.com/@PsychHub", name: "Psych Hub" },
  {
    authorUrl: "https://www.youtube.com/@NIMHgov",
    name: "National Institute of Mental Health",
  },
] as const;

export const youtubeHost = "www.youtube.com";

export function channelForAuthorUrl(raw: unknown) {
  if (typeof raw !== "string") return null;
  return videoChannels.find((c) => c.authorUrl === raw.trim()) ?? null;
}

/** The 11-character id from a youtube.com/watch?v= or youtu.be/ link, else null. */
export function youtubeVideoId(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : ["www.youtube.com", "youtube.com", "m.youtube.com"].includes(
              u.hostname,
            ) && u.pathname === "/watch"
          ? u.searchParams.get("v")
          : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const videoUrl = (id: string) => `https://${youtubeHost}/watch?v=${id}`;
