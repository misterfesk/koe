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

const knownHostNames: Record<string, string> = {
  ...Object.fromEntries(sources.map((s) => [s.host, s.name])),
  "khanacademy.org": "Khan Academy",
  "www.khanacademy.org": "Khan Academy",
  "ocw.mit.edu": "MIT OpenCourseWare",
  "freecodecamp.org": "freeCodeCamp",
  "www.freecodecamp.org": "freeCodeCamp",
  "coursera.org": "Coursera",
  "www.coursera.org": "Coursera",
  "edx.org": "edX",
  "www.edx.org": "edX",
  "en.wikipedia.org": "Wikipedia",
  "wikipedia.org": "Wikipedia",
  "reddit.com": "Reddit",
  "www.reddit.com": "Reddit",
  "verywellmind.com": "Verywell Mind",
  "www.verywellmind.com": "Verywell Mind",
  "apa.org": "American Psychological Association",
  "www.apa.org": "American Psychological Association",
  "sleepfoundation.org": "Sleep Foundation",
  "www.sleepfoundation.org": "Sleep Foundation",
  "todoist.com": "Todoist",
  "www.todoist.com": "Todoist",
  "bbc.co.uk": "BBC",
  "www.bbc.co.uk": "BBC",
  "bbc.com": "BBC",
  "www.bbc.com": "BBC",
  "mayoclinic.org": "Mayo Clinic",
  "www.mayoclinic.org": "Mayo Clinic",
  "clevelandclinic.org": "Cleveland Clinic",
  "my.clevelandclinic.org": "Cleveland Clinic",
  "harvard.edu": "Harvard",
  "www.health.harvard.edu": "Harvard Health",
  "bacp.co.uk": "BACP",
  "www.bacp.co.uk": "BACP",
  "counselling-directory.org.uk": "Counselling Directory",
  "www.counselling-directory.org.uk": "Counselling Directory",
  "psychologytoday.com": "Psychology Today",
  "www.psychologytoday.com": "Psychology Today",
  "citizensadvice.org.uk": "Citizens Advice",
  "www.citizensadvice.org.uk": "Citizens Advice",
  "stepchange.org": "StepChange",
  "www.stepchange.org": "StepChange",
  "nationaldebtline.org": "National Debtline",
  "www.nationaldebtline.org": "National Debtline",
  "nationalcareers.service.gov.uk": "National Careers Service",
  "www.gov.uk": "GOV.UK",
  "gov.uk": "GOV.UK",
  "headtohealth.gov.au": "Head to Health",
  "www.headtohealth.gov.au": "Head to Health",
  "beyondblue.org.au": "Beyond Blue",
  "www.beyondblue.org.au": "Beyond Blue",
  "findahelpline.com": "Find A Helpline",
  "wyzant.com": "Wyzant",
  "www.wyzant.com": "Wyzant",
  "superprof.co.uk": "Superprof",
  "www.superprof.co.uk": "Superprof",
  "superprof.com": "Superprof",
  "www.superprof.com": "Superprof",
  "firsttutors.com": "First Tutors",
  "www.firsttutors.com": "First Tutors",
  "varsitytutors.com": "Varsity Tutors",
  "www.varsitytutors.com": "Varsity Tutors",
  "princetonreview.com": "The Princeton Review",
  "www.princetonreview.com": "The Princeton Review",
  "greenpath.com": "GreenPath",
  "www.greenpath.com": "GreenPath",
  "nfcc.org": "NFCC",
  "www.nfcc.org": "NFCC",
  "nami.org": "NAMI",
  "www.nami.org": "NAMI",
  "thinkcbt.com": "Think CBT",
  "www.thinkcbt.com": "Think CBT",
  "thebettersleepclinic.co.uk": "The Better Sleep Clinic",
  "www.thebettersleepclinic.co.uk": "The Better Sleep Clinic",
  "abct.org": "ABCT",
  "www.abct.org": "ABCT",
  "services.abct.org": "ABCT",
  "salvationarmy.org.uk": "The Salvation Army",
  "www.salvationarmy.org.uk": "The Salvation Army",
  "turn2us.org.uk": "Turn2us",
  "www.turn2us.org.uk": "Turn2us",
  "moneyhelper.org.uk": "MoneyHelper",
  "www.moneyhelper.org.uk": "MoneyHelper",
  "babcp.com": "BABCP",
  "www.babcp.com": "BABCP",
  "ukcp.org.uk": "UKCP",
  "www.ukcp.org.uk": "UKCP",
  "talkingchange.nhs.uk": "NHS Talking Change",
  "www.talkingchange.nhs.uk": "NHS Talking Change",
  "vitahealthgroup.co.uk": "Vita Health Group",
  "www.vitahealthgroup.co.uk": "Vita Health Group",
  "guysandstthomasspecialistcare.co.uk": "Guy's and St Thomas'",
  "www.guysandstthomasspecialistcare.co.uk": "Guy's and St Thomas'",
  "nypl.org": "New York Public Library",
  "www.nypl.org": "New York Public Library",
};

/** Low-quality, social-feed, shortener, marketplace or tabloid hosts never pass. */
const blockedHostSuffixes = [
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "facebook.com",
  "threads.net",
  "pinterest.com",
  "snapchat.com",
  "tumblr.com",
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "amazon.com",
  "amazon.co.uk",
  "ebay.com",
  "walmart.com",
  "etsy.com",
  "aliexpress.com",
  "temu.com",
  "wish.com",
  "ehow.com",
  "ezinearticles.com",
  "hubpages.com",
  "dailymail.co.uk",
  "thesun.co.uk",
  "nypost.com",
  "prnewswire.com",
  "businesswire.com",
];

export function orderedSources(region?: string | null) {
  const rank = (r: string) => (r === region ? 0 : r === "global" ? 1 : 2);
  return [...sources].sort((a, b) => rank(a.region) - rank(b.region));
}

function readableHostName(host: string): string {
  if (knownHostNames[host]) return knownHostNames[host];
  const bare = host.replace(/^www\./, "");
  if (knownHostNames[bare]) return knownHostNames[bare];
  const parts = bare.split(".");
  const main =
    parts.length >= 3 &&
    ["co", "org", "gov", "ac", "edu"].includes(parts.at(-2)!)
      ? parts.at(-3)!
      : (parts.at(-2) ?? bare);
  if (main.length <= 4 && /^(mit|bbc|apa|cdc|who|nih)$/i.test(main))
    return main.toUpperCase();
  return main
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Validates an HTTPS resource URL and returns its host and publisher display
 * name. Rejects non-HTTPS, credentials, custom ports, IP literals, localhost,
 * spoofed health/gov domains, child/teen subdomains, and blocked social or
 * commercial hosts. For NHS/gov health domains only the exact verified host is
 * trusted so regional trust/children subdomains never inherit trust.
 */
export function sourceForUrl(raw: string): {
  host: string;
  name: string;
  region: string;
  termsChecked: boolean;
} | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    const host = u.hostname.toLowerCase();
    if (
      !host.includes(".") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      host.startsWith("[") ||
      host === "localhost" ||
      /\.(local|internal|invalid|test|example|onion)$/.test(host)
    )
      return null;
    const exact = sources.find((s) => s.host === host);
    if (exact) return exact;
    // Prevent subdomain spoofing or unverified regional/children's NHS/gov subdomains.
    if (
      /(?:^|\.)(nhs\.uk|mind\.org\.uk|helpguide\.org|nih\.gov|gov\.au)(?:\.|$)/.test(
        host,
      )
    )
      return null;
    if (
      /\b(children|childrens|kids|teens|youth|pediatric|paediatric)\b/.test(
        host,
      )
    )
      return null;
    if (blockedHostSuffixes.some((b) => host === b || host.endsWith(`.${b}`)))
      return null;
    return {
      host,
      name: readableHostName(host),
      region: "global",
      termsChecked: false,
    };
  } catch {
    return null;
  }
}

/**
 * YouTube channels whose videos the Shelf may show. A video is kept only when
 * YouTube's oEmbed `author_url` for it matches one of these exactly.
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
  { authorUrl: "https://www.youtube.com/@khanacademy", name: "Khan Academy" },
  { authorUrl: "https://www.youtube.com/@crashcourse", name: "CrashCourse" },
  { authorUrl: "https://www.youtube.com/@3blue1brown", name: "3Blue1Brown" },
  { authorUrl: "https://www.youtube.com/@freecodecamp", name: "freeCodeCamp" },
  {
    authorUrl: "https://www.youtube.com/@mitocw",
    name: "MIT OpenCourseWare",
  },
  {
    authorUrl: "https://www.youtube.com/@theschooloflifetv",
    name: "The School of Life",
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
