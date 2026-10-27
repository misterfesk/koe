import { describe, expect, it } from "vitest";
import {
  intakeModel,
  templateMemories,
  templateSummary,
  wakes,
  type IntakeInput,
  type IntakeModel,
} from "@/domain/intake";
import {
  alternativeFor,
  assignTimes,
  breaksGuardrails,
  candidatesFor,
  checkComposition,
  compositionPromptText,
  contextFor,
  detectEatingConcern,
  fallbackPlan,
  guardrailHits,
  kindAreas,
  kindLabel,
  LAST_MINUTE,
  menuPromptText,
  mentionsExercise,
  mentionsFood,
  planKinds,
  planMenu,
  planSizes,
  wakeStart,
  type PlanItem,
} from "@/domain/plan-menu";
import { detectRisk } from "@/domain/safety";

const model = (input: IntakeInput = {}): IntakeModel =>
  intakeModel.parse(input);

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  kind: "basics",
  title: "Drink a glass of water",
  why: "Because you said the basics matter",
  size: "tiny",
  minuteOfDay: 9 * 60,
  ...over,
});

const ctx = (over: Partial<ReturnType<typeof contextFor>> = {}) => ({
  ...contextFor(model()),
  ...over,
});

describe("the menu", () => {
  it("covers every kind with labels, an area and examples at every size", () => {
    expect(planKinds).toHaveLength(11);
    for (const kind of planKinds) {
      expect(kindLabel(kind)).toBeTruthy();
      expect(kindAreas[kind]).toBeTruthy();
      for (const size of planSizes)
        expect(planMenu[kind].examples[size].length).toBeGreaterThan(0);
    }
  });

  it("uses the labels the product spec gives people", () => {
    expect(kindLabel("enjoy")).toBe("Something you used to enjoy");
    expect(kindLabel("reach_out")).toBe("Reach out to someone");
    expect(kindLabel("work_chunk")).toBe(
      "A small piece of work or study, then a break",
    );
  });

  it("never ships an example that breaks its own guardrails", () => {
    for (const kind of planKinds)
      for (const size of planSizes)
        for (const e of planMenu[kind].examples[size]) {
          const title = e.title.replace("{name}", "Sam");
          expect(guardrailHits(title), title).toEqual([]);
          expect(detectRisk(title), title).toBe("none");
        }
  });

  it("generates prompt text from the module", () => {
    const text = menuPromptText();
    for (const kind of planKinds) expect(text).toContain(`- ${kind} `);
    expect(compositionPromptText(contextFor(model({ wake: "9to11" })))).toMatch(
      /Exactly 3 items/,
    );
  });
});

describe("bedtime and the glossary", () => {
  it("treats a bedtime reminder as a bedtime rule, and a gentle wind-down as fine", () => {
    expect(breaksGuardrails("Set a simple bedtime reminder for tonight")).toBe(
      true,
    );
    expect(guardrailHits("Set a bedtime alarm")).toContain("bedtime rule");
    expect(
      breaksGuardrails(
        "Dim the lights and put your phone down for a few minutes",
      ),
    ).toBe(false);
    expect(
      breaksGuardrails("Spend ten minutes on something quiet before bed"),
    ).toBe(false);
  });

  it("keeps the old noun out of the rules-based copy", () => {
    const texts: string[] = [];
    for (const kind of planKinds)
      for (const size of planSizes)
        texts.push(...planMenu[kind].examples[size].map((e) => e.title));
    for (const m of [model({ puttingOff: "my taxes" }), model()])
      for (const kind of planKinds)
        for (const c of candidatesFor(kind, m)) texts.push(c.title, c.why);
    // "Step outside" is a verb, so only the noun use is checked.
    const noun =
      /(^|[^a-z])(a|the|first|next|one|small|tiny) steps?([^a-z]|$)/i;
    for (const t of texts) expect(t).not.toMatch(noun);
  });
});

describe("breaksGuardrails", () => {
  const hits = [
    "Weigh yourself each morning",
    "Track your weight",
    "Count your calories today",
    "Try a new diet",
    "Try intermittent fasting",
    "Skip a meal if you are not hungry",
    "Go for a run to burn off dinner",
    "Sit by a light box for 20 minutes",
    "Sunlight treats depression, so get outside",
    "Stay up late to reset your body clock",
    "Try sleep restriction this week",
    "Do some expressive writing about your feelings",
    "Journal about your feelings for 20 minutes",
    "Say a daily affirmation",
    "Write a gratitude list",
    "Take a vitamin or a supplement",
    "Check your medication dose",
    "Have a glass of wine to unwind",
    "Quit your job and start fresh",
    "You may have depression",
    "A diagnosis could help",
    "Keep your streak going",
    "You missed yesterday",
    "We can do this together",
    "Let's start with a song",
    "Us against the day",
    "This is clinically proven to help",
    "You'll enjoy it",
    "This will make you feel better",
    "Try some meditation",
    "Keep a mood log",
  ];
  const misses = [
    "Put on one song you used to like",
    "Drink a glass of water",
    "Send Sam a short hello",
    "Open a window for a minute",
    "Note one question you would like to ask a doctor",
    "Wake in the same hour tomorrow",
    "Work for 15 minutes, then take a 5-minute break",
    "Because you said music used to lift you",
    "Take a short walk to the corner",
    "Wash your face and put on clean clothes",
  ];
  it.each(hits)("flags: %s", (text) => {
    expect(breaksGuardrails(text), text).toBe(true);
  });
  it.each(misses)("allows: %s", (text) => {
    expect(guardrailHits(text), text).toEqual([]);
  });
  it("names which guardrail fired", () => {
    expect(guardrailHits("Count your calories")).toContain("calories");
  });
});

describe("detectEatingConcern", () => {
  const flagged = [
    "I've been restricting my food",
    "I'm not eating anything these days",
    "I've barely been eating",
    "I stopped eating properly",
    "I haven't eaten in days",
    "I binge and then feel awful",
    "I've been bingeing at night",
    "I purge after dinner",
    "I keep throwing up after eating",
    "I make myself sick after meals",
    "I hate my body",
    "I feel so fat",
    "I'm worried about my weight",
    "I want to lose weight fast",
    "counting every calorie",
    "I'm on a diet and it's miserable",
    "I think I have an eating disorder",
    "I don't deserve to eat",
  ];
  const normal = [
    "I skipped lunch, busy day",
    "I forgot to eat breakfast",
    "I love cooking for my family",
    "binge-watching shows is my comfort",
    "I binged on Netflix all weekend",
    "I'm going to purge my closet",
    "We're not eating out this week",
    "I'd like to eat more vegetables",
    "I want to get fitter",
    "I'm tired all the time",
    "Dinner with friends cheers me up",
    "I walk to work",
  ];
  it.each(flagged)("flags: %s", (text) => {
    expect(detectEatingConcern(text), text).toBe(true);
  });
  it.each(normal)("does not flag: %s", (text) => {
    expect(detectEatingConcern(text), text).toBe(false);
  });
});

describe("checkComposition", () => {
  const good: PlanItem[] = [
    item({ kind: "basics", minuteOfDay: 480 }),
    item({
      kind: "enjoy",
      title: "Put on one song you used to like",
      minuteOfDay: 1110,
    }),
    item({
      kind: "outside",
      title: "Open a window for a minute",
      minuteOfDay: 780,
    }),
  ];
  const codes = (items: PlanItem[], c = ctx({ hasLifts: true })) =>
    checkComposition(items, c).map((v) => v.code);

  it("accepts a good first day", () => {
    expect(codes(good)).toEqual([]);
  });

  it("wants exactly 3 on the first day and 3 to 5 after", () => {
    expect(codes(good.slice(0, 2))).toContain("count");
    expect(
      codes([...good, item({ kind: "kind", minuteOfDay: 1200 })]),
    ).toContain("count");
    expect(
      codes(
        [...good, item({ kind: "kind", minuteOfDay: 1200 })],
        ctx({ hasLifts: true, firstDay: false }),
      ),
    ).toEqual([]);
    expect(
      codes(
        [...good, ...good, item({ kind: "kind", minuteOfDay: 1250 })],
        ctx({ hasLifts: true, firstDay: false }),
      ),
    ).toContain("count");
  });

  it("allows at most one reach out and one move", () => {
    const two = [
      item({
        kind: "reach_out",
        title: "Send Sam a short hello",
        minuteOfDay: 780,
      }),
      item({
        kind: "reach_out",
        title: "Send Sam a thumbs-up",
        minuteOfDay: 840,
      }),
      item({ kind: "basics", minuteOfDay: 480 }),
    ];
    expect(codes(two, ctx({ namedPerson: true }))).toContain("reach_out_limit");
    const moves = [
      item({
        kind: "move",
        title: "Stretch for two minutes",
        minuteOfDay: 480,
      }),
      item({ kind: "move", title: "Take a ten-minute walk", minuteOfDay: 780 }),
      item({ kind: "basics", minuteOfDay: 900 }),
    ];
    expect(codes(moves)).toContain("move_limit");
  });

  it("wants an item from what used to lift them, only when they said something", () => {
    const noEnjoy = [
      item({ kind: "basics", minuteOfDay: 480 }),
      item({
        kind: "outside",
        title: "Open a window for a minute",
        minuteOfDay: 780,
      }),
      item({
        kind: "kind",
        title: "Say one line to yourself that a friend would say",
        minuteOfDay: 1110,
      }),
    ];
    expect(codes(noEnjoy, ctx({ hasLifts: true }))).toContain("no_lift");
    expect(codes(noEnjoy, ctx({ hasLifts: false }))).toEqual([]);
  });

  it("wants a task, basics, work chunk, problem or wind down", () => {
    const none = [
      item({
        kind: "enjoy",
        title: "Put on one song you used to like",
        minuteOfDay: 480,
      }),
      item({
        kind: "outside",
        title: "Open a window for a minute",
        minuteOfDay: 780,
      }),
      item({
        kind: "kind",
        title: "Say one line to yourself that a friend would say",
        minuteOfDay: 1110,
      }),
    ];
    expect(codes(none)).toContain("no_core");
    expect(
      codes(
        none.map((i) =>
          i.kind === "kind" ? { ...i, kind: "wind_down" as const } : i,
        ),
      ),
    ).not.toContain("no_core");
  });

  it("allows reach out only when someone was named", () => {
    const reach = [
      item({
        kind: "reach_out",
        title: "Send Sam a short hello",
        minuteOfDay: 780,
      }),
      item({ kind: "basics", minuteOfDay: 480 }),
      item({
        kind: "outside",
        title: "Open a window for a minute",
        minuteOfDay: 900,
      }),
    ];
    expect(codes(reach, ctx({ namedPerson: false }))).toContain(
      "reach_out_unnamed",
    );
    expect(codes(reach, ctx({ namedPerson: true }))).toEqual([]);
  });

  it("drops food, movement and exercise when an eating concern is flagged", () => {
    const eating = ctx({ eatingConcern: true });
    expect(
      codes(
        [
          item({ kind: "move", title: "Stretch for two minutes" }),
          ...good.slice(1),
        ],
        eating,
      ),
    ).toContain("eating");
    expect(
      codes(
        [
          item({ kind: "basics", title: "Eat something, anything small" }),
          ...good.slice(1),
        ],
        eating,
      ),
    ).toContain("eating");
    expect(
      codes(
        [
          item({
            kind: "enjoy",
            title: "Take a ten-minute walk somewhere you like",
            minuteOfDay: 1110,
          }),
          good[0],
          good[2],
        ],
        eating,
      ),
    ).toContain("eating");
    expect(codes(good, eating)).toEqual([]);
    expect(mentionsFood("Make a simple meal")).toBe(true);
    expect(mentionsExercise("Take a ten-minute walk")).toBe(true);
    expect(mentionsFood("Drink a glass of water")).toBe(false);
  });

  it("keeps the first day tiny or small", () => {
    expect(codes([{ ...good[0], size: "medium" }, good[1], good[2]])).toContain(
      "size",
    );
    expect(
      codes(
        [{ ...good[0], size: "medium" }, good[1], good[2]],
        ctx({ hasLifts: true, firstDay: false }),
      ),
    ).not.toContain("size");
  });

  it("keeps times inside waking hours from the wake-time answer", () => {
    const early = good.map((i, n) => ({
      ...i,
      minuteOfDay: 6 * 60 + 30 + n * 60,
    }));
    expect(codes(early, ctx({ hasLifts: true, wake: "9to11" }))).toContain(
      "time",
    );
    expect(codes(early, ctx({ hasLifts: true, wake: "before7" }))).toEqual([]);
    const late = good.map((i) => ({ ...i, minuteOfDay: LAST_MINUTE + 5 }));
    expect(codes(late)).toContain("time");
  });
});

describe("assignTimes", () => {
  it("never starts before the person is up and spaces items out", () => {
    for (const wake of [...wakes, undefined]) {
      const kinds = [
        "enjoy",
        "basics",
        "outside",
        "wind_down",
        "reach_out",
      ] as const;
      const t = assignTimes([...kinds], wake);
      for (const m of t) {
        expect(m).toBeGreaterThanOrEqual(wakeStart(wake));
        expect(m).toBeLessThanOrEqual(LAST_MINUTE);
      }
      expect(new Set(t).size).toBe(t.length);
      expect(
        [...t]
          .sort((a, b) => a - b)
          .every((m, i, all) => i === 0 || m - all[i - 1] >= 45),
      ).toBe(true);
    }
  });
});

// A spread of answers: every wake band, with and without interests, goals,
// a named person, a thing put off and an eating concern, plus all skipped.
const matrix: [string, IntakeInput][] = [
  ["all skipped", {}],
  ["nothing lifts, basics goal", { goals: ["basics"], people: ["nobody"] }],
  [
    "nobody named",
    { goals: ["less_alone"], people: ["friend"], lifts: ["music"] },
  ],
  [
    "music and walking",
    { goals: ["energy"], lifts: ["music", "walking"], wake: "7to9" },
  ],
  [
    "sleep",
    { goals: ["sleep", "through_day"], lifts: ["reading"], wake: "9to11" },
  ],
  [
    "named person",
    {
      goals: ["less_alone", "enjoy_again"],
      people: ["friend"],
      names: [{ name: "Sam", save: true }],
      lifts: ["games", "pets"],
      wake: "before7",
    },
  ],
  [
    "work and putting off",
    {
      goals: ["work_study"],
      days: "working",
      puttingOff: "my taxes",
      lifts: ["other"],
      wake: "later_varies",
    },
  ],
  ["enjoy again, no lifts", { goals: ["enjoy_again", "energy"], wake: "7to9" }],
  [
    "only a note about what lifts",
    { notes: { lifts: "my old guitar" }, goals: ["through_day"] },
  ],
  [
    "eating concern, cooking and walking lift, friend named",
    {
      eatingConcern: true,
      goals: ["energy", "basics"],
      lifts: ["cooking", "walking"],
      people: ["friend"],
      names: [{ name: "Alex", save: false }],
      wake: "7to9",
    },
  ],
  ["eating concern, nothing else", { eatingConcern: true }],
  [
    "eating concern, only cooking lifts",
    { eatingConcern: true, lifts: ["cooking"], goals: ["energy"] },
  ],
  [
    "every interest, every goal",
    {
      goals: ["through_day", "energy"],
      lifts: [
        "music",
        "walking",
        "cooking",
        "games",
        "pets",
        "outdoors",
        "making",
        "faith",
        "reading",
        "shows",
        "other",
      ],
      people: ["friend", "family"],
      names: [
        { name: "Sam", save: false },
        { name: "Priya", save: false },
      ],
    },
  ],
];

describe("fallbackPlan", () => {
  const cases: [string, IntakeModel][] = [];
  for (const [name, input] of matrix)
    for (const wake of [undefined, ...wakes])
      cases.push([
        `${name} / ${wake ?? "no wake"}`,
        model({ wake, ...input, ...(input.wake ? { wake: input.wake } : {}) }),
      ]);

  it.each(cases)("satisfies the composition rules: %s", (_, m) => {
    const plan = fallbackPlan(m);
    expect(checkComposition(plan, contextFor(m))).toEqual([]);
    expect(plan).toHaveLength(3);
    for (const p of plan) {
      expect(guardrailHits(p.title), p.title).toEqual([]);
      expect(guardrailHits(p.why), p.why).toEqual([]);
      expect(detectRisk(p.title + " " + p.why)).toBe("none");
      // Second person reasons.
      expect(p.why).toMatch(/^Because you|^Because a|^Because one|^Because it/);
    }
    // Sorted by time.
    expect(plan.map((p) => p.minuteOfDay)).toEqual(
      [...plan.map((p) => p.minuteOfDay)].sort((a, b) => a - b),
    );
    // The same answers give the same plan.
    expect(fallbackPlan(m)).toEqual(plan);
  });

  it("builds the enjoy item from the chosen interest", () => {
    const music = fallbackPlan(model({ lifts: ["music"] }));
    const enjoy = music.find((p) => p.kind === "enjoy")!;
    expect(enjoy.title).toBe("Put on one song you used to like");
    expect(enjoy.why).toBe("Because you said music used to lift you");
  });

  it("names the person in the reach out item and in no other place it shouldn't", () => {
    const plan = fallbackPlan(
      model({
        goals: ["less_alone"],
        people: ["friend"],
        names: [{ name: "Sam", save: false }],
      }),
    );
    const reach = plan.find((p) => p.kind === "reach_out")!;
    expect(reach.title).toBe("Send Sam a short hello");
    expect(
      fallbackPlan(model({ goals: ["less_alone"], people: ["friend"] })).some(
        (p) => p.kind === "reach_out",
      ),
    ).toBe(false);
  });

  it("leads with basics or mastery and does not promise fun when nothing lifts", () => {
    const plan = fallbackPlan(model({ goals: ["basics"], people: ["nobody"] }));
    expect(plan.some((p) => p.kind === "enjoy")).toBe(false);
    expect(plan.some((p) => p.kind === "basics")).toBe(true);
  });

  it("keeps food and movement out when an eating concern is flagged", () => {
    const plan = fallbackPlan(
      model({
        eatingConcern: true,
        goals: ["energy", "basics"],
        lifts: ["cooking", "walking"],
      }),
    );
    expect(plan.map((p) => p.kind)).not.toContain("move");
    for (const p of plan) {
      expect(mentionsFood(p.title + " " + p.why), p.title).toBe(false);
      expect(mentionsExercise(p.title + " " + p.why), p.title).toBe(false);
    }
  });

  it("gives different people different words", () => {
    const titles = new Set(
      ["a", "bb", "ccc", "dddd", "eeeee", "ffffff", "ggggggg", "hhhhhhhh"].map(
        (n) =>
          fallbackPlan(model({ goals: ["basics"], notes: { people: n } }))
            .map((p) => p.title)
            .join("|"),
      ),
    );
    expect(titles.size).toBeGreaterThan(1);
  });

  it("offers a different item of the same kind to swap to, and stays valid", () => {
    for (const [, input] of matrix) {
      const m = model(input);
      const plan = fallbackPlan(m);
      plan.forEach((p, i) => {
        const alt = alternativeFor(p, m);
        expect(alt, `${p.kind} / ${p.title}`).not.toBeNull();
        expect(alt!.kind).toBe(p.kind);
        expect(alt!.title).not.toBe(p.title);
        expect(alt!.minuteOfDay).toBe(p.minuteOfDay);
        const next = plan.map((x, j) => (j === i ? alt! : x));
        expect(checkComposition(next, contextFor(m))).toEqual([]);
      });
    }
  });

  it("has several candidates for every kind it can use", () => {
    const m = model({
      names: [{ name: "Sam", save: false }],
      lifts: ["music"],
    });
    for (const kind of planKinds)
      expect(candidatesFor(kind, m).length, kind).toBeGreaterThan(1);
  });
});

describe("template summary and memories", () => {
  it("leaves cooking and walking out when food or weight worry is flagged", () => {
    const m = model({ eatingConcern: true, lifts: ["cooking", "walking"] });
    expect(templateSummary(m)).not.toMatch(/cook|walk/i);
    expect(templateSummary(m)).toMatch(/Some things used to lift you/);
    expect(
      templateMemories(m)
        .map((x) => x.text)
        .join(" "),
    ).not.toMatch(/cook|walk/i);
    const mixed = model({ eatingConcern: true, lifts: ["cooking", "music"] });
    expect(templateSummary(mixed)).toMatch(/Music used to lift you/);
    expect(templateSummary(mixed)).not.toMatch(/cook/i);
    expect(templateSummary(model({ lifts: ["cooking", "walking"] }))).toMatch(
      /Cooking and walking used to lift you/,
    );
  });

  it("speaks to the person and never as we", () => {
    const m = model({
      goals: ["sleep", "energy"],
      wake: "7to9",
      days: "working",
      busiest: "morning",
      lifts: ["music", "walking"],
      names: [{ name: "Sam", save: true }],
    });
    const summary = templateSummary(m);
    expect(summary).toMatch(/^You/);
    expect(breaksGuardrails(summary)).toBe(false);
    expect(summary.length).toBeLessThanOrEqual(400);
    for (const mem of templateMemories(m)) {
      expect(mem.text.length).toBeLessThanOrEqual(120);
      expect(breaksGuardrails(mem.text)).toBe(false);
    }
    expect(templateMemories(m).length).toBeLessThanOrEqual(4);
    expect(templateSummary(model())).toMatch(/simple, gentle day/);
  });
});
