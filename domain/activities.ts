import type { Area, Energy, StepView } from "./steps";

// A small library of ordinary activities for behavioural activation: things
// that bring a little enjoyment, a sense of getting something done, movement
// or contact with people. Sized by energy so a low day gets a tiny step.
// Deliberately absent (PRODUCTION-PLAN.md "Don't build"): relaxation
// exercises, gratitude lists, expressive writing and anything clinical.

export type Activity = {
  id: string;
  area: Area;
  energy: Energy;
  title: string;
  /** A cut-down version of the same activity, used when the AI is off. */
  smaller: string;
  cue: string;
};

export const activities: Activity[] = [
  // Move
  {
    id: "m1",
    area: "move",
    energy: "low",
    title: "Stand up and stretch for one minute",
    smaller: "Stand up and reach your arms up once",
    cue: "When I next get up",
  },
  {
    id: "m2",
    area: "move",
    energy: "low",
    title: "Step outside your door for two minutes",
    smaller: "Open the door and stand in the doorway",
    cue: "After my next drink",
  },
  {
    id: "m3",
    area: "move",
    energy: "okay",
    title: "Walk to the end of the street and back",
    smaller: "Walk to the front door and back",
    cue: "After lunch",
  },
  {
    id: "m4",
    area: "move",
    energy: "okay",
    title: "Put on one song and move to it",
    smaller: "Put on one song and tap along",
    cue: "After I get dressed",
  },
  {
    id: "m5",
    area: "move",
    energy: "more",
    title: "Take a 15-minute walk somewhere you like",
    smaller: "Take a 5-minute walk",
    cue: "After lunch",
  },
  {
    id: "m6",
    area: "move",
    energy: "more",
    title: "Do 10 minutes of exercise you enjoy",
    smaller: "Do 3 minutes of exercise you enjoy",
    cue: "When I get home",
  },
  // People
  {
    id: "c1",
    area: "connect",
    energy: "low",
    title: "Send someone a one-line message",
    smaller: "Send someone an emoji",
    cue: "After breakfast",
  },
  {
    id: "c2",
    area: "connect",
    energy: "low",
    title: "Reply to one message you've been meaning to answer",
    smaller: "Open that message and write one word",
    cue: "When I next pick up my phone",
  },
  {
    id: "c3",
    area: "connect",
    energy: "okay",
    title: "Ask someone how their week is going",
    smaller: "Send someone a photo or a link they'd like",
    cue: "After lunch",
  },
  {
    id: "c4",
    area: "connect",
    energy: "okay",
    title: "Do one small kind thing for someone",
    smaller: "Thank someone for something small",
    cue: "When I next see someone",
  },
  {
    id: "c5",
    area: "connect",
    energy: "more",
    title: "Call someone for five minutes",
    smaller: "Text someone to ask if they're free to talk",
    cue: "After dinner",
  },
  {
    id: "c6",
    area: "connect",
    energy: "more",
    title: "Make a small plan to see someone",
    smaller: "Suggest a day to meet someone",
    cue: "After lunch",
  },
  // Look after yourself
  {
    id: "s1",
    area: "care",
    energy: "low",
    title: "Drink a glass of water",
    smaller: "Fill a glass and put it beside you",
    cue: "Right after I read this",
  },
  {
    id: "s2",
    area: "care",
    energy: "low",
    title: "Open a curtain or window for some daylight",
    smaller: "Open the curtain a little",
    cue: "When I get up",
  },
  {
    id: "s3",
    area: "care",
    energy: "low",
    title: "Change into fresh clothes",
    smaller: "Change your top",
    cue: "After I wake up",
  },
  {
    id: "s4",
    area: "care",
    energy: "okay",
    title: "Make yourself something simple to eat",
    smaller: "Eat one piece of fruit or toast",
    cue: "At lunchtime",
  },
  {
    id: "s5",
    area: "care",
    energy: "okay",
    title: "Have a shower",
    smaller: "Wash your face and hands",
    cue: "After I get up",
  },
  {
    id: "s6",
    area: "care",
    energy: "more",
    title: "Cook one proper meal",
    smaller: "Cook one simple dish",
    cue: "At dinner time",
  },
  // Get something done
  {
    id: "d1",
    area: "do",
    energy: "low",
    title: "Put five things back where they belong",
    smaller: "Put one thing back where it belongs",
    cue: "After my next drink",
  },
  {
    id: "d2",
    area: "do",
    energy: "low",
    title: "Throw away one thing you don't need",
    smaller: "Pick up one piece of rubbish",
    cue: "When I walk past the bin",
  },
  {
    id: "d3",
    area: "do",
    energy: "okay",
    title: "Wash the dishes from one meal",
    smaller: "Wash one cup",
    cue: "After I eat",
  },
  {
    id: "d4",
    area: "do",
    energy: "okay",
    title: "Deal with one email or letter",
    smaller: "Open one email or letter",
    cue: "After breakfast",
  },
  {
    id: "d5",
    area: "do",
    energy: "more",
    title: "Spend 20 minutes on a task you've put off",
    smaller: "Spend 5 minutes on a task you've put off",
    cue: "After lunch",
  },
  {
    id: "d6",
    area: "do",
    energy: "more",
    title: "Tidy one surface",
    smaller: "Clear one corner of a surface",
    cue: "When I get home",
  },
  // Something you enjoy
  {
    id: "e1",
    area: "enjoy",
    energy: "low",
    title: "Listen to one song you like",
    smaller: "Listen to the first minute of a song you like",
    cue: "When I sit down",
  },
  {
    id: "e2",
    area: "enjoy",
    energy: "low",
    title: "Read one page of something you like",
    smaller: "Read one paragraph",
    cue: "Before bed",
  },
  {
    id: "e3",
    area: "enjoy",
    energy: "okay",
    title: "Make a drink you like and have it by a window",
    smaller: "Make a drink you like",
    cue: "Mid-afternoon",
  },
  {
    id: "e4",
    area: "enjoy",
    energy: "okay",
    title: "Spend 15 minutes on a hobby",
    smaller: "Get your hobby things out",
    cue: "After dinner",
  },
  {
    id: "e5",
    area: "enjoy",
    energy: "more",
    title: "Go somewhere you like: a café, a park, a shop",
    smaller: "Walk past somewhere you like",
    cue: "This afternoon",
  },
  {
    id: "e6",
    area: "enjoy",
    energy: "more",
    title: "Start something creative for 20 minutes",
    smaller: "Start something creative for 5 minutes",
    cue: "After dinner",
  },
];

/** One honest line per area on why it might be worth trying. No promises. */
export const areaWhy: Record<Area, string> = {
  move: "Even a little movement is linked with better mood for many people.",
  connect: "People tend to underestimate how welcome a small message is.",
  care: "Small basics can make the rest of the day a bit easier.",
  do: "Finishing something small can give a sense of getting somewhere.",
  enjoy:
    "Low mood crowds out enjoyable things. Small doses help bring them back.",
};

const fits: Record<Energy, Energy[]> = {
  low: ["low"],
  okay: ["low", "okay"],
  more: ["okay", "more"],
};

export type Suggestion = {
  key: string;
  area: Area;
  title: string;
  cue: string;
  /** Why this one: shown to the person, never hidden. */
  because: string;
  sourceMemoryId?: string;
};

/**
 * Deterministic suggestions: steps the person said helped before come first,
 * then library activities sized to today's energy, rotating across areas
 * and skipping ones already on Today.
 */
export function suggestions(
  steps: StepView[],
  energy: Energy | null,
  seed: number,
  today?: string,
): Suggestion[] {
  // Skip anything already planned, and anything already done today.
  const onToday = new Set(
    steps
      .filter(
        (s) => s.status === "active" || s.reports.some((r) => r.day === today),
      )
      .map((s) => s.title.toLowerCase()),
  );
  const helped: Suggestion[] = [];
  for (const step of steps) {
    const good = step.reports.find((r) => r.helped === "helped");
    const key = step.title.toLowerCase();
    if (
      !good ||
      onToday.has(key) ||
      helped.some((h) => h.title.toLowerCase() === key)
    )
      continue;
    helped.push({
      key: "past-" + step.id,
      area: step.area,
      title: step.title,
      cue: step.cue ?? "",
      because: "You said this helped when you tried it before.",
    });
  }
  const pool = activities.filter(
    (a) =>
      fits[energy ?? "okay"].includes(a.energy) &&
      !onToday.has(a.title.toLowerCase()),
  );
  const rotated = pool.map((_, i) => pool[(i + seed * 5) % pool.length]);
  const library = rotated.map((a) => ({
    key: a.id,
    area: a.area,
    title: a.title,
    cue: a.cue,
    because:
      energy === "low"
        ? "Sized for a low-energy day. " + areaWhy[a.area]
        : areaWhy[a.area],
  }));
  return [...helped.slice(0, 2), ...library];
}

export function librarySmaller(title: string) {
  const match = activities.find(
    (a) => a.title.toLowerCase() === title.trim().toLowerCase(),
  );
  return match?.smaller ?? null;
}
