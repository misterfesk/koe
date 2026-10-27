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
