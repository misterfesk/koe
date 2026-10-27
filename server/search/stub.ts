import "server-only";

// Explicit local fixture only; hosted APP_URL values cannot activate it.
export const searchStubbed = () =>
  process.env.KOE_SEARCH_STUB === "on" &&
  /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(
    process.env.APP_URL ?? "",
  );

export const stubSearchHits = () => [
  {
    title: "Ideas for low mood",
    url: "https://www.nhs.uk/mental-health/self-help/low-mood/",
    content:
      "Small practical ideas for adults finding everyday life difficult with low mood. Explore ordinary ways to make daily life more manageable at your own pace.",
    score: 1,
  },
  {
    title: "Looking after yourself",
    url: "https://www.mind.org.uk/information-support/low-mood/",
    content:
      "A guide for adults to looking after yourself when your mood is low. Read about small changes and ways to choose what feels manageable for your day.",
    score: 0.9,
  },
  {
    title: "Finding enjoyable moments",
    url: "https://www.helpguide.org/mental-health/wellbeing/enjoyable-moments",
    content:
      "Ideas for adults who want to reconnect with things they once enjoyed. You can read about finding a little time for music, making things or other interests.",
    score: 0.8,
  },
];
