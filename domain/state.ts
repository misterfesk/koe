import { z } from "zod";
import type { Energy, ToneSetting } from "./tone";
export type Outcome = "Done" | "Partly" | "Not this time" | "Prefer not to say";
export type Report = {
  title: string;
  version: number;
  prediction: string;
  outcome: Outcome;
  barrier: string;
  experience: string;
  at: string;
};
export type PlanVersion = {
  version: number;
  title: string;
  prediction: string;
  at: string;
};
export type Step = {
  id: string;
  title: string;
  area: string;
  prediction: string;
  version: number;
  reports: Report[];
  proposal?: string;
  paused: boolean;
  routine?: boolean;
  sourceMemoryId?: string;
  versions?: PlanVersion[];
};
export type Memory = { id: string; text: string; source: string; at: string };
export type Journal = { id: string; text: string; energy: Energy; at: string };
export type Reminders = {
  enabled: boolean;
  paused: boolean;
  timezone: string;
  quietStart: number;
  quietEnd: number;
  hour: number;
  frequency: "daily" | "weekly";
  weekday: number;
  targetId: string;
};
export type Scenario =
  | "first visit"
  | "returning after absence"
  | "low energy"
  | "empty history"
  | "sparse history"
  | "declined suggestion"
  | "provider offline"
  | "revoked consent"
  | "no safe contact"
  | "coaching paused";
export const scenarios: Scenario[] = [
  "first visit",
  "returning after absence",
  "low energy",
  "empty history",
  "sparse history",
  "declined suggestion",
  "provider offline",
  "revoked consent",
  "no safe contact",
  "coaching paused",
];
export type State = {
  scenario: Scenario;
  sequence: number;
  energy: Energy;
  goal: string;
  region: string;
  adult: boolean;
  onboarded: boolean;
  steps: Step[];
  activeId: string;
  declined: boolean;
  drafts: Record<string, string>;
  memories: Memory[];
  temporary: boolean;
  memoryConsent: boolean;
  journal: Journal[];
  reminders: Reminders;
  clock: string;
  appearance: {
    tone: ToneSetting;
    plain: boolean;
    reducedMotion: boolean;
    mascot: boolean;
  };
  providerEnabled: boolean;
  contactOutcome: string;
  careChecklist: string[];
  notice: string;
};
export const stepInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give your step a few words.")
    .max(240, "Use 240 characters or fewer."),
  area: z.string().min(1),
  prediction: z.string().trim().max(500, "Use 500 characters or fewer."),
});
export function initialState(scenario: Scenario = "first visit"): State {
  const s: State = {
    scenario,
    sequence: 0,
    energy: "unknown",
    goal: "Make room for myself",
    region: "US",
    adult: false,
    onboarded: false,
    steps: [],
    activeId: "",
    declined: false,
    drafts: {},
    memories: [],
    temporary: false,
    memoryConsent: true,
    journal: [],
    reminders: {
      enabled: false,
      paused: false,
      timezone: "UTC",
      quietStart: 22,
      quietEnd: 8,
      hour: 10,
      frequency: "daily",
      weekday: 1,
      targetId: "",
    },
    clock: "2026-10-25T12:00:00.000Z",
    appearance: {
      tone: "expressive",
      plain: false,
      reducedMotion: false,
      mascot: true,
    },
    providerEnabled: true,
    contactOutcome: "",
    careChecklist: [],
    notice: "",
  };
  if (scenario === "low energy") s.energy = "low";
  if (scenario === "declined suggestion") s.declined = true;
  if (scenario === "provider offline") s.providerEnabled = false;
  if (scenario === "revoked consent") {
    s.memoryConsent = false;
    s.temporary = true;
  }
  if (scenario === "no safe contact") s.drafts["connect.person"] = "none";
  if (scenario === "returning after absence" || scenario === "sparse history") {
    s.onboarded = true;
    s.journal = [
      {
        id: "seed-note",
        text: "Fictional note: a quiet afternoon with a book.",
        energy: "steady",
        at: "2026-10-18T12:00:00.000Z",
      },
    ];
  }
  return s;
}
export type Action =
  | { type: "reset"; scenario?: Scenario }
  | { type: "draft"; key: string; value: string }
  | { type: "clearDraft"; prefix: string }
  | { type: "energy"; value: Energy }
  | {
      type: "profile";
      value: Partial<Pick<State, "goal" | "region" | "adult" | "onboarded">>;
    }
  | {
      type: "choose";
      title: string;
      area: string;
      prediction: string;
      routine?: boolean;
      sourceMemoryId?: string;
    }
  | { type: "active"; id: string }
  | { type: "decline" }
  | { type: "deleteStep"; id: string }
  | { type: "pauseStep"; id: string }
  | {
      type: "report";
      id: string;
      outcome: Outcome;
      barrier: string;
      experience: string;
    }
  | { type: "propose"; id: string; title: string }
  | { type: "acceptAdjustment"; id: string }
  | { type: "rejectAdjustment"; id: string }
  | { type: "reminders"; value: Reminders }
  | { type: "clock"; value: string }
  | { type: "memoryAdd"; text: string; source: string }
  | { type: "memoryEdit"; id: string; text: string }
  | { type: "memoryDelete"; id: string }
  | { type: "temporary"; value: boolean }
  | { type: "memoryConsent"; value: boolean }
  | { type: "journalAdd"; text: string; energy: Energy }
  | { type: "journalEdit"; id: string; text: string }
  | { type: "journalDelete"; id: string }
  | { type: "appearance"; value: Partial<State["appearance"]> }
  | { type: "provider"; value: boolean }
  | { type: "contactOutcome"; value: string }
  | { type: "careChecklist"; value: string[] }
  | { type: "notice"; value: string }
  | { type: "deleteData" };
export function reducer(s: State, a: Action): State {
  const mapStep = (fn: (p: Step) => Step) =>
    s.steps.map((p) => ("id" in a && p.id === a.id ? fn(p) : p));
  switch (a.type) {
    case "reset":
      return initialState(a.scenario);
    case "draft":
      return { ...s, drafts: { ...s.drafts, [a.key]: a.value } };
    case "clearDraft":
      return {
        ...s,
        drafts: Object.fromEntries(
          Object.entries(s.drafts).filter(([k]) =>
            a.prefix.endsWith(".") ? !k.startsWith(a.prefix) : k !== a.prefix,
          ),
        ),
      };
    case "energy":
      return { ...s, energy: a.value };
    case "profile":
      return { ...s, ...a.value };
    case "choose": {
      if (a.sourceMemoryId && !canRetrieveMemory(s, a.sourceMemoryId)) return s;
      const parsed = stepInput.safeParse(a);
      if (!parsed.success) return s;
      const id = "step-" + (s.sequence + 1);
      return {
        ...s,
        sequence: s.sequence + 1,
        activeId: id,
        declined: false,
        steps: [
          ...s.steps,
          {
            id,
            ...parsed.data,
            version: 1,
            reports: [],
            paused: false,
            routine: a.routine,
            sourceMemoryId: a.sourceMemoryId,
            versions: [
              {
                version: 1,
                title: parsed.data.title,
                prediction: parsed.data.prediction,
                at: s.clock,
              },
            ],
          },
        ],
        notice: "Step chosen.",
      };
    }
    case "active":
      return { ...s, activeId: a.id };
    case "decline":
      return {
        ...s,
        declined: true,
        activeId: "",
        notice: "Nothing to catch up on. You can stop here.",
      };
    case "deleteStep":
      return {
        ...s,
        steps: s.steps.filter((p) => p.id !== a.id),
        activeId: s.activeId === a.id ? "" : s.activeId,
        reminders:
          s.reminders.targetId === a.id
            ? { ...s.reminders, enabled: false, targetId: "" }
            : s.reminders,
      };
    case "pauseStep":
      return {
        ...s,
        steps: mapStep((p) => ({ ...p, paused: !p.paused })),
        reminders:
          s.reminders.targetId === a.id
            ? { ...s.reminders, paused: true }
            : s.reminders,
      };
    case "report":
      return {
        ...s,
        steps: mapStep((p) => ({
          ...p,
          reports: [
            ...p.reports,
            {
              title: p.title,
              version: p.version,
              prediction: p.prediction,
              outcome: a.outcome,
              barrier: a.barrier,
              experience: a.experience,
              at: s.clock,
            },
          ],
        })),
      };
    case "propose":
      return {
        ...s,
        steps: mapStep((p) => ({
          ...p,
          proposal: a.title.trim().slice(0, 240) || undefined,
        })),
      };
    case "acceptAdjustment":
      return {
        ...s,
        steps: mapStep((p) =>
          p.proposal
            ? {
                ...p,
                title: p.proposal,
                proposal: undefined,
                version: p.version + 1,
                prediction: "",
                versions: [
                  ...(p.versions ?? [
                    {
                      version: p.version,
                      title: p.title,
                      prediction: p.prediction,
                      at: s.clock,
                    },
                  ]),
                  {
                    version: p.version + 1,
                    title: p.proposal,
                    prediction: "",
                    at: s.clock,
                  },
                ],
              }
            : p,
        ),
      };
    case "rejectAdjustment":
      return { ...s, steps: mapStep((p) => ({ ...p, proposal: undefined })) };
    case "reminders":
      return { ...s, reminders: a.value };
    case "clock":
      return { ...s, clock: a.value };
    case "memoryAdd":
      if (s.temporary || !s.memoryConsent || !a.text.trim()) return s;
      return {
        ...s,
        sequence: s.sequence + 1,
        memories: [
          ...s.memories,
          {
            id: "memory-" + (s.sequence + 1),
            text: a.text.trim().slice(0, 1000),
            source: a.source,
            at: s.clock,
          },
        ],
      };
    case "memoryEdit":
      return {
        ...s,
        memories: s.memories.map((m) =>
          m.id === a.id ? { ...m, text: a.text.trim().slice(0, 1000) } : m,
        ),
      };
    case "memoryDelete":
      return {
        ...s,
        memories: s.memories.filter((m) => m.id !== a.id),
        reminders: s.steps.some(
          (p) => p.id === s.reminders.targetId && p.sourceMemoryId === a.id,
        )
          ? { ...s.reminders, enabled: false, targetId: "" }
          : s.reminders,
      };
    case "temporary":
      return {
        ...s,
        temporary: a.value,
        reminders:
          a.value && hasMemoryReminder(s)
            ? { ...s.reminders, enabled: false, targetId: "" }
            : s.reminders,
      };
    case "memoryConsent":
      return {
        ...s,
        memoryConsent: a.value,
        // Revoking consent forces temporary mode; restoring consent keeps the user's own temporary choice.
        temporary: a.value ? s.temporary : true,
        reminders:
          !a.value && hasMemoryReminder(s)
            ? { ...s.reminders, enabled: false, targetId: "" }
            : s.reminders,
      };
    case "journalAdd":
      return {
        ...s,
        sequence: s.sequence + 1,
        journal: [
          ...s.journal,
          {
            id: "note-" + (s.sequence + 1),
            text: a.text.trim().slice(0, 3000),
            energy: a.energy,
            at: s.clock,
          },
        ],
      };
    case "journalEdit":
      return {
        ...s,
        journal: s.journal.map((j) =>
          j.id === a.id ? { ...j, text: a.text.trim().slice(0, 3000) } : j,
        ),
      };
    case "journalDelete":
      return { ...s, journal: s.journal.filter((j) => j.id !== a.id) };
    case "appearance":
      return { ...s, appearance: { ...s.appearance, ...a.value } };
    case "provider":
      return { ...s, providerEnabled: a.value };
    case "contactOutcome":
      return { ...s, contactOutcome: a.value };
    case "careChecklist":
      return { ...s, careChecklist: a.value };
    case "notice":
      return { ...s, notice: a.value };
    case "deleteData":
      return {
        ...initialState(),
        providerEnabled: false,
        memoryConsent: false,
        temporary: true,
        notice: "Session data deleted. Scripted suggestions disabled.",
      };
  }
}
export function makeSmaller(title: string) {
  return ("A smaller part of: " + title).slice(0, 240);
}
export function canRetrieveMemory(s: State, id: string) {
  return s.memoryConsent && !s.temporary && s.memories.some((m) => m.id === id);
}
function hasMemoryReminder(s: State) {
  return s.steps.some(
    (p) => p.id === s.reminders.targetId && !!p.sourceMemoryId,
  );
}
export type Suggestion = {
  title: string;
  area: string;
  sourceMemoryId?: string;
};
export function getSuggestionOptions(s: State): Suggestion[] {
  const approved = s.memories
    .filter((m) => canRetrieveMemory(s, m.id))
    .map((m) => ({
      title: ("Make a little room for: " + m.text).slice(0, 240),
      area: s.goal === "Connection" ? "Connection" : "Enjoyment",
      sourceMemoryId: m.id,
    }));
  const area =
    s.energy === "low"
      ? "Rest"
      : ["Rest", "Connection", "Care access", "Everyday care"].includes(s.goal)
        ? s.goal
        : "Enjoyment";
  const title =
    s.energy === "low"
      ? "Pause somewhere comfortable for one minute"
      : area === "Connection"
        ? "Draft a short hello to someone you consider safe"
        : area === "Care access"
          ? "Write one question about care access"
          : area === "Everyday care"
            ? "Put a glass of water within reach"
            : area === "Rest"
              ? "Rest somewhere comfortable for a minute"
              : "Read one page of something you enjoy";
  return [
    ...approved,
    { title, area },
    { title: "Put a glass of water within reach", area: "Everyday care" },
    {
      title: "Open a curtain, if that suits your space",
      area: "Everyday care",
    },
  ];
}
export function suggestions(s: State) {
  return getSuggestionOptions(s).map((x) => x.title);
}
export function hasPlannerDraft(s: State) {
  return Object.entries(s.drafts).some(
    ([key, value]) => key.startsWith("step.") && value.trim() !== "",
  );
}

export function currentReport(step: Step | undefined) {
  return step?.reports.filter((r) => r.version === step.version).at(-1);
}
