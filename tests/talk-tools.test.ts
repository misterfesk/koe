import { describe, expect, it } from "vitest";
import { goals, intakeModel, lifts } from "@/domain/intake";
import {
  buildResourceQuery,
  queryVocabulary,
  resourceFormats,
} from "@/domain/resources";
import {
  isEverydayMemory,
  isMicroStep,
  readProposals,
  resultLines,
  toolSchemas,
  vetCall,
  vetCalls,
  type VetContext,
} from "@/domain/talk-tools";

const model = intakeModel.parse({ wake: "7to9" });

const base = (over: Partial<VetContext> = {}): VetContext => ({
  items: [
    {
      stepId: "walk",
      kind: "move",
      title: "Take a short walk",
      why: "Because you said walking helps",
      size: "small",
      minuteOfDay: 11 * 60,
      done: false,
    },
    {
      stepId: "letter",
      kind: "task",
      title: "Open the letter",
      why: "Because a letter is waiting",
      size: "tiny",
      minuteOfDay: 9 * 60,
      done: false,
    },
    {
      stepId: "song",
      kind: "enjoy",
      title: "Put on one song",
      why: "Because music used to lift you",
      size: "tiny",
      minuteOfDay: 15 * 60,
      done: true,
    },
  ],
  people: [{ id: "sam", name: "Sam", channel: "message" }],
  model,
  memoryOn: true,
  memories: ["Short walks help you"],
  planMode: "normal",
  ...over,
});

let n = 0;
const id = () => `id${++n}`;
const call = (name: string, args: unknown) => ({ name, args });

describe("buildResourceQuery", () => {
  it("is built from fixed phrases for every enum combination", () => {
    for (const goal of goals)
      for (const interest of [...lifts.filter((l) => l !== "other"), null])
        for (const format of [...resourceFormats, null]) {
          const q = buildResourceQuery({ goal, interest, format });
          for (const word of q.split(" "))
            expect(queryVocabulary.has(word), `${word} in "${q}"`).toBe(true);
        }
  });

  it("cannot carry anything the person wrote", () => {
    const secret = "my-landlord-Dave-owes-me-500";
    for (const tags of [
      { goal: secret },
      { goal: "sleep", interest: secret },
      { goal: "sleep", format: secret },
      { goal: "sleep", note: secret },
      { goal: "__proto__" },
    ]) {
      expect(() => buildResourceQuery(tags as never)).toThrow();
    }
  });

  it("reads like a search", () => {
    expect(
      buildResourceQuery({ goal: "sleep", interest: "music", format: "video" }),
    ).toBe(
      "tips for sleeping better when feeling low with music practical self-help guide for adults short video TED-Ed NHS Psych Hub Mind",
    );
  });
});

describe("tool schemas", () => {
  it("find_resources takes enums only", () => {
    const s = toolSchemas.find_resources;
    expect(s.safeParse({ goal: "sleep" }).success).toBe(true);
    expect(s.safeParse({ goal: "my own words about work" }).success).toBe(
      false,
    );
    expect(s.safeParse({ goal: "sleep", interest: "dave" }).success).toBe(
      false,
    );
  });

  it("set_reminder needs exactly one of itemId or morningPlan", () => {
    const s = toolSchemas.set_reminder;
    expect(s.safeParse({ itemId: "a" }).success).toBe(true);
    expect(s.safeParse({ morningPlan: "08:30" }).success).toBe(true);
    expect(s.safeParse({}).success).toBe(false);
    expect(s.safeParse({ itemId: "a", morningPlan: "08:30" }).success).toBe(
      false,
    );
    expect(s.safeParse({ morningPlan: "8am" }).success).toBe(false);
  });
});

describe("checking a call", () => {
  it("never offers to shrink a This week thing (D036)", () => {
    const v = base();
    expect(vetCall("shrink_item", { itemId: "walk" }, v)).not.toBeNull();
    v.items[0] = { ...v.items[0], weekItemId: "thing-1" };
    expect(vetCall("shrink_item", { itemId: "walk" }, v)).toBeNull();
    expect(
      vetCall(
        "shrink_item",
        { itemId: "walk", smallerTitle: "Walk to the door" },
        v,
      ),
    ).toBeNull();
  });

  it("turns a valid move into a pending card that names the item", () => {
    const { proposals, dropped } = vetCalls(
      [call("move_item", { itemId: "walk", minuteOfDay: 1020 })],
      base(),
      id,
    );
    expect(dropped).toBe(0);
    expect(proposals).toEqual([
      {
        id: expect.any(String),
        name: "move_item",
        args: { itemId: "walk", minuteOfDay: 1020 },
        status: "pending",
        meta: { title: "Take a short walk", from: 660 },
      },
    ]);
  });

  it("does not mistake an id with a long run of digits for a phone number", () => {
    const id = "12345678-1234-5678-9012-345678901234";
    const v = base();
    v.items[0] = { ...v.items[0], stepId: id };
    const r = vetCalls(
      [
        call("move_item", { itemId: id, minuteOfDay: 1020 }),
        call("draft_message", {
          personId: "sam",
          draft: "Hi Sam, free later?",
        }),
      ],
      v,
    );
    expect(r.proposals.map((p) => p.name)).toEqual([
      "move_item",
      "draft_message",
    ]);
  });

  it("drops calls with invalid arguments, unknown ids and finished items", () => {
    const v = base();
    for (const c of [
      call("move_item", { itemId: "nope", minuteOfDay: 1020 }),
      call("move_item", { itemId: "song", minuteOfDay: 1020 }),
      call("move_item", { itemId: "walk", minuteOfDay: 17 }),
      call("move_item", { itemId: "walk", minuteOfDay: 660 }),
      call("move_item", { itemId: "walk" }),
      call("add_item", { kind: "nonsense", title: "Do a thing", size: "tiny" }),
      call("not_a_tool", {}),
      call("draft_message", { personId: "stranger", draft: "Hi there" }),
    ]) {
      const r = vetCalls([c], v, id);
      expect(r.proposals, JSON.stringify(c)).toEqual([]);
      expect(r.dropped).toBe(1);
    }
  });

  it("drops an add_item that breaks the never-suggest list", () => {
    for (const title of [
      "Go on a diet",
      "Count your calories today",
      "Skip lunch to feel lighter",
    ]) {
      expect(
        vetCall("add_item", { kind: "basics", title, size: "tiny" }, base()),
        title,
      ).toBeNull();
    }
    // Also in the why line.
    expect(
      vetCall(
        "add_item",
        {
          kind: "basics",
          title: "Wash your face",
          size: "tiny",
          why: "Because a diet might help",
        },
        base(),
      ),
    ).toBeNull();
  });

  it("with an eating concern, a cooking or walking add_item is dropped", () => {
    const worried = base({
      model: intakeModel.parse({ wake: "7to9", eatingConcern: true }),
    });
    for (const title of [
      "Cook a simple meal",
      "Go for a walk round the block",
    ]) {
      expect(
        vetCall("add_item", { kind: "enjoy", title, size: "small" }, worried),
        title,
      ).toBeNull();
    }
    expect(
      vetCall(
        "add_item",
        { kind: "enjoy", title: "Put on a record", size: "tiny" },
        worried,
      ),
    ).not.toBeNull();
    // A shrink title and a reading search follow the same rule.
    expect(
      vetCall(
        "shrink_item",
        { itemId: "letter", smallerTitle: "Make a snack" },
        worried,
      ),
    ).toBeNull();
    expect(
      vetCall(
        "find_resources",
        { goal: "basics", interest: "cooking" },
        worried,
      ),
    ).toBeNull();
    expect(
      vetCall("find_resources", { goal: "basics", interest: "music" }, worried),
    ).not.toBeNull();
  });

  it("drops text that names a helpline, a number or a risk phrase", () => {
    expect(
      vetCall(
        "draft_message",
        { personId: "sam", draft: "Call me on 0412 345 678 please" },
        base(),
      ),
    ).toBeNull();
    expect(
      vetCall(
        "save_memory",
        { kind: "hard", text: "You want to disappear sometimes" },
        base(),
      ),
    ).toBeNull();
    expect(
      vetCall(
        "add_item",
        { kind: "task", title: "Visit www.example.com", size: "tiny" },
        base(),
      ),
    ).toBeNull();
  });

  it("keeps a second move out of a day that already has one", () => {
    expect(
      vetCall(
        "add_item",
        { kind: "move", title: "Stretch", size: "tiny" },
        base(),
      ),
    ).toBeNull();
    expect(
      vetCall(
        "add_item",
        { kind: "outside", title: "Open a window", size: "tiny" },
        base(),
      ),
    ).not.toBeNull();
  });

  it("will not add a sixth thing, or a copy of one already there", () => {
    const five = base();
    five.items = [
      ...five.items,
      { ...five.items[1], stepId: "x1", title: "One" },
      { ...five.items[1], stepId: "x2", title: "Two" },
    ];
    expect(
      vetCall(
        "add_item",
        { kind: "outside", title: "Open a window", size: "tiny" },
        five,
      ),
    ).toBeNull();
    expect(
      vetCall(
        "add_item",
        { kind: "outside", title: "open the letter", size: "tiny" },
        base(),
      ),
    ).toBeNull();
  });

  it("offers a memory card only when memory is on, and not twice or about health", () => {
    const card = { kind: "helps", text: "Music helps in the evening" };
    expect(vetCall("save_memory", card, base())).not.toBeNull();
    expect(vetCall("save_memory", card, base({ memoryOn: false }))).toBeNull();
    expect(
      vetCall(
        "save_memory",
        { ...card, text: "Slow evening walks help you" },
        base(),
      ),
    ).not.toBeNull();
    expect(
      vetCall(
        "save_memory",
        { kind: "helps", text: "Short walks help you" },
        base(),
      ),
    ).toBeNull();
    expect(
      vetCall(
        "save_memory",
        { kind: "hard", text: "You take sertraline for depression" },
        base(),
      ),
    ).toBeNull();
  });

  it("shows the exact search a find_resources card would send", () => {
    const r = vetCall(
      "find_resources",
      { goal: "sleep", format: "article" },
      base(),
    )!;
    expect(r.query).toBe(
      buildResourceQuery({ goal: "sleep", format: "article" }),
    );
    expect(r.args).toEqual({ goal: "sleep", format: "article" });
  });

  it("shows at most two cards and ignores repeats", () => {
    const calls = [
      call("move_item", { itemId: "walk", minuteOfDay: 1020 }),
      call("move_item", { itemId: "walk", minuteOfDay: 1020 }),
      call("prepare_appointment", {}),
      call("find_resources", { goal: "sleep" }),
    ];
    const r = vetCalls(calls, base(), id);
    expect(r.proposals.map((p) => p.name)).toEqual([
      "move_item",
      "prepare_appointment",
    ]);
    expect(r.dropped).toBe(2);
  });
});

describe("older proposals", () => {
  it("reads the shape from before tools as pending cards", () => {
    const read = readProposals({
      step: { title: "Walk to the shop", area: "move", cue: "After lunch" },
      memory: { kind: "helps", text: "Short walks help you" },
    });
    expect(read?.tools.map((t) => [t.id, t.name, t.status])).toEqual([
      ["legacy-step", "add_item", "pending"],
      ["legacy-memory", "save_memory", "pending"],
    ]);
    expect(read?.tools[0].args).toMatchObject({
      kind: "move",
      title: "Walk to the shop",
      size: "small",
    });
  });

  it("reads the new shape back as it was stored, and nothing as nothing", () => {
    const stored = {
      tools: [
        {
          id: "a",
          name: "move_item",
          args: { itemId: "walk", minuteOfDay: 1020 },
          status: "done",
          result: "Moved to 5:00 pm. You can undo it on Today.",
        },
      ],
    };
    expect(readProposals(stored)).toEqual(stored);
    expect(readProposals({})).toBeNull();
    expect(readProposals("junk")).toBeNull();
  });
});

describe("card lines", () => {
  it("are plain templates with no banned words", () => {
    const lines = [
      resultLines.add_item(),
      resultLines.break_down_topic(3),
      resultLines.edit_item("Review linear equations"),
      resultLines.split_item(2),
      resultLines.merge_items("Practice algebra and geometry"),
      resultLines.move_item("5:00 pm"),
      resultLines.shrink_item(),
      resultLines.reminderItem("5:00 pm"),
      resultLines.reminderMorning("8:00 am"),
      resultLines.save_memory(),
      resultLines.find_resources(),
      resultLines.draftCopied(),
      resultLines.draftSms(),
      resultLines.draftEmail(),
      resultLines.prepare_appointment(),
      resultLines.dismissed(),
    ];
    for (const l of lines) {
      expect(l).not.toMatch(/\b(step|steps|task|item|anchor)\b/i);
      expect(l).not.toMatch(/\b(we|us)\b|!/i);
    }
    expect(resultLines.draftCopied()).toBe("Copied. Nothing was sent.");
  });
});

describe("D037 topic breakdown, task editing and progressive profiling", () => {
  it("accepts 2–5 meaningful sub-areas on break_down_topic and rejects micro-steps", () => {
    expect(isMicroStep("Write three rough words for your CV")).toBe(true);
    expect(isMicroStep("Open laptop")).toBe(true);
    expect(isMicroStep("Review linear equations and inequalities")).toBe(false);

    const good = vetCall(
      "break_down_topic",
      {
        topic: "SAT math prep",
        subareas: [
          { title: "Review linear equations and algebra", size: "small" },
          { title: "Practice geometry and right triangles", size: "small" },
          { title: "Do a 15-minute timed problem set", size: "small" },
        ],
      },
      base(),
    );
    expect(good).not.toBeNull();
    expect(good?.meta?.title).toBe("SAT math prep");

    const micro = vetCall(
      "break_down_topic",
      {
        topic: "CV update",
        subareas: [
          { title: "Write three rough words for your CV", size: "tiny" },
          { title: "Open the file", size: "tiny" },
        ],
      },
      base(),
    );
    expect(micro).toBeNull();
  });

  it("vets edit_item, split_item and merge_items against today's items", () => {
    const edited = vetCall(
      "edit_item",
      { itemId: "letter", newTitle: "Reply to the council letter" },
      base(),
    );
    expect(edited?.meta?.title).toBe("Open the letter");
    expect(
      vetCall(
        "edit_item",
        { itemId: "letter", newTitle: "Open the letter" },
        base(),
      ),
    ).toBeNull();

    const split = vetCall(
      "split_item",
      {
        itemId: "letter",
        parts: [
          { title: "Read the council letter and note the reference" },
          { title: "Draft a two-line reply to the council" },
        ],
      },
      base(),
    );
    expect(split?.meta?.title).toBe("Open the letter");

    const merged = vetCall(
      "merge_items",
      {
        itemIds: ["walk", "letter"],
        mergedTitle: "Post the council reply on a short walk",
      },
      base(),
    );
    expect(merged?.meta?.titles).toEqual([
      "Take a short walk",
      "Open the letter",
    ]);
  });

  it("distinguishes everyday facts from sensitive details for progressive profiling", () => {
    expect(
      isEverydayMemory("helps", "Lo-fi music and tea in the afternoon helps"),
    ).toBe(true);
    expect(
      isEverydayMemory(
        "preference",
        "Studying algebra in 20-minute blocks works best for you",
      ),
    ).toBe(true);
    expect(
      isEverydayMemory("hard", "Loud mornings make it hard to start"),
    ).toBe(false);
    expect(
      isEverydayMemory(
        "people",
        "Sam is your brother who checks in on Sundays",
      ),
    ).toBe(false);
    expect(
      isEverydayMemory("helps", "Talking when you feel lonely helps"),
    ).toBe(false);
  });
});
