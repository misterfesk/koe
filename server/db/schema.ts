import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// --- Better Auth core tables (field names must match its defaults) ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("is_anonymous").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// --- Koe app tables ---
// Every app table carries user_id with ON DELETE CASCADE so deleting the
// account removes all of a person's data in one statement, and guest-to-account
// linking can move ownership with one UPDATE per table.
// Columns ending in _enc hold free text sealed by server/crypto.ts.

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const created = () => timestamp("created_at").notNull().defaultNow();
const updated = () => timestamp("updated_at").notNull().defaultNow();
/** A calendar day in the person's own timezone, "YYYY-MM-DD". */
const day = (name: string) => date(name, { mode: "string" });

export const areas = ["move", "connect", "care", "do", "enjoy"] as const;
export const energies = ["low", "okay", "more"] as const;
export const outcomes = ["done", "partly", "not", "skip"] as const;
export const helpedValues = ["helped", "same", "harder"] as const;
export const expectations = ["low", "unsure", "good"] as const;
export const memoryKinds = ["helps", "hard", "people", "preference"] as const;
export const talkModes = [
  "talk",
  "plan",
  "problem",
  "thought",
  "reach",
  "care",
] as const;
export const tones = ["expressive", "calm", "plain"] as const;

export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // ISO country/region code used to pick verified Help resources.
  region: text("region"),
  // IANA zone captured from the browser, e.g. "Asia/Singapore".
  timezone: text("timezone").notNull().default("UTC"),
  adultAttestedAt: timestamp("adult_attested_at"),
  onboardedAt: timestamp("onboarded_at"),
  // Set when a risk signal was seen; coaching waits until the person resumes.
  coachingPausedAt: timestamp("coaching_paused_at"),
  lastSeenAt: timestamp("last_seen_at"),
  memoryOn: boolean("memory_on").notNull().default(true),
  keepTranscripts: boolean("keep_transcripts").notNull().default(true),
  nudgesPerDay: integer("nudges_per_day").notNull().default(1),
  // Minutes after local midnight.
  quietStart: integer("quiet_start").notNull().default(1320),
  quietEnd: integer("quiet_end").notNull().default(480),
  tone: text("tone", { enum: tones }).notNull().default("expressive"),
  plain: boolean("plain").notNull().default(false),
  reducedMotion: boolean("reduced_motion").notNull().default(false),
  // Owner decision D027: plain by default, the person can turn it on.
  mascot: boolean("mascot").notNull().default(false),
  // Journey patterns the person said don't fit, by pattern key.
  dismissedPatterns: text("dismissed_patterns")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: created(),
  updatedAt: updated(),
});

/** Optional one-tap energy check-in, at most one per local day. */
export const checkIn = pgTable(
  "check_in",
  {
    id: id(),
    userId: owner(),
    day: day("day").notNull(),
    energy: text("energy", { enum: energies }).notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("check_in_user_day_idx").on(t.userId, t.day)],
);

export const memoryCard = pgTable(
  "memory_card",
  {
    id: id(),
    userId: owner(),
    kind: text("kind", { enum: memoryKinds }).notNull(),
    textEnc: text("text_enc").notNull(),
    // Where it came from: the person typed it, or approved it in Talk or a report.
    source: text("source", { enum: ["you", "talk", "report"] }).notNull(),
    sourceRef: text("source_ref"),
    useForSuggestions: boolean("use_for_suggestions").notNull().default(true),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("memory_card_user_idx").on(t.userId)],
);

export const conversation = pgTable(
  "conversation",
  {
    id: id(),
    userId: owner(),
    mode: text("mode", { enum: talkModes }).notNull().default("talk"),
    titleEnc: text("title_enc"),
    safetyPausedAt: timestamp("safety_paused_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("conversation_user_idx").on(t.userId, t.updatedAt)],
);

export const message = pgTable(
  "message",
  {
    id: id(),
    userId: owner(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "safety"] }).notNull(),
    contentEnc: text("content_enc").notNull(),
    // Sealed JSON of what Koe offered with this reply (a step, a memory card).
    proposalsEnc: text("proposals_enc"),
    createdAt: created(),
  },
  (t) => [index("message_conversation_idx").on(t.conversationId)],
);

export const step = pgTable(
  "step",
  {
    id: id(),
    userId: owner(),
    area: text("area", { enum: areas }).notNull(),
    titleEnc: text("title_enc").notNull(),
    // The "when" half of an if-then plan: "After lunch".
    cueEnc: text("cue_enc"),
    // What the person expects before trying it, compared later with how it went.
    expectation: text("expectation", { enum: expectations }),
    // The practical problem this step came from, when it came from problem solving.
    problemEnc: text("problem_enc"),
    // active: on Today when due. finished: a one-off that was done.
    // archived: let go of, kept in history.
    status: text("status", {
      enum: ["active", "paused", "finished", "archived"],
    })
      .notNull()
      .default("active"),
    // 0 = Sunday … 6 = Saturday. Null means a one-off step.
    repeatDays: integer("repeat_days").array(),
    // For one-off steps: the first local day it shows on Today.
    plannedFor: day("planned_for"),
    version: integer("version").notNull().default(1),
    sourceMemoryId: text("source_memory_id").references(() => memoryCard.id, {
      onDelete: "set null",
    }),
    sourceConversationId: text("source_conversation_id").references(
      () => conversation.id,
      { onDelete: "set null" },
    ),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("step_user_idx").on(t.userId)],
);

/** Every earlier wording of a step, so reports stay tied to what was tried. */
export const stepVersion = pgTable(
  "step_version",
  {
    id: id(),
    userId: owner(),
    stepId: text("step_id")
      .notNull()
      .references(() => step.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    titleEnc: text("title_enc").notNull(),
    cueEnc: text("cue_enc"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("step_version_idx").on(t.stepId, t.version)],
);

export const stepReport = pgTable(
  "step_report",
  {
    id: id(),
    userId: owner(),
    stepId: text("step_id")
      .notNull()
      .references(() => step.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    day: day("day").notNull(),
    outcome: text("outcome", { enum: outcomes }).notNull(),
    helped: text("helped", { enum: helpedValues }),
    // Copied from the step when reported, so later edits don't rewrite history.
    expectation: text("expectation", { enum: expectations }),
    barrierEnc: text("barrier_enc"),
    noteEnc: text("note_enc"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("step_report_user_idx").on(t.userId, t.day),
    // One answer per step per day; a second tap changes it.
    uniqueIndex("step_report_step_day_idx").on(t.stepId, t.day),
  ],
);

export const note = pgTable(
  "note",
  {
    id: id(),
    userId: owner(),
    kind: text("kind", { enum: ["note", "thought"] })
      .notNull()
      .default("note"),
    textEnc: text("text_enc").notNull(),
    energy: text("energy", { enum: energies }),
    sourceConversationId: text("source_conversation_id").references(
      () => conversation.id,
      { onDelete: "set null" },
    ),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("note_user_idx").on(t.userId, t.createdAt)],
);

export type WeeklyDecision = "keep" | "shrink" | "swap" | "pause";

/** One per person per week. Decisions map step ids to keep/shrink/swap/pause. */
export const weeklyReview = pgTable(
  "weekly_review",
  {
    id: id(),
    userId: owner(),
    weekStart: day("week_start").notNull(),
    noteEnc: text("note_enc"),
    decisions: jsonb("decisions")
      .$type<Record<string, WeeklyDecision>>()
      .notNull()
      .default({}),
    createdAt: created(),
  },
  (t) => [uniqueIndex("weekly_review_week_idx").on(t.userId, t.weekStart)],
);

export const person = pgTable(
  "person",
  {
    id: id(),
    userId: owner(),
    nameEnc: text("name_enc").notNull(),
    channel: text("channel", {
      enum: ["message", "call", "email", "in_person"],
    })
      .notNull()
      .default("message"),
    createdAt: created(),
  },
  (t) => [index("person_user_idx").on(t.userId)],
);

/** A reach-out the person planned: Koe drafts, the person sends it themselves. */
export const reachOut = pgTable(
  "reach_out",
  {
    id: id(),
    userId: owner(),
    personId: text("person_id").references(() => person.id, {
      onDelete: "set null",
    }),
    draftEnc: text("draft_enc").notNull(),
    status: text("status", {
      enum: ["draft", "sent", "replied", "no_reply", "not_sent"],
    })
      .notNull()
      .default("draft"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("reach_out_user_idx").on(t.userId)],
);

/** A reminder the person set for one step. Koe never adds one on its own. */
export const reminder = pgTable(
  "reminder",
  {
    id: id(),
    userId: owner(),
    stepId: text("step_id")
      .notNull()
      .references(() => step.id, { onDelete: "cascade" }),
    minuteOfDay: integer("minute_of_day").notNull(),
    // 0 = Sunday … 6 = Saturday.
    days: integer("days").array().notNull(),
    paused: boolean("paused").notNull().default(false),
    nextAt: timestamp("next_at"),
    lastSentAt: timestamp("last_sent_at"),
    // Reminders sent without the step being opened or reported since.
    ignoredCount: integer("ignored_count").notNull().default(0),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("reminder_step_idx").on(t.stepId),
    index("reminder_due_idx").on(t.nextAt),
  ],
);

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: id(),
    userId: owner(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: created(),
  },
  (t) => [index("push_subscription_user_idx").on(t.userId)],
);

// A record that a risk signal was seen and what Koe showed. No message text
// is stored here: the level and the source are enough to audit behaviour.
export const safetyEvent = pgTable(
  "safety_event",
  {
    id: id(),
    userId: owner(),
    level: text("level", { enum: ["concern", "urgent"] }).notNull(),
    source: text("source", { enum: ["rules", "model"] }).notNull(),
    surface: text("surface").notNull(),
    createdAt: created(),
  },
  (t) => [index("safety_event_user_idx").on(t.userId)],
);

/**
 * Tables whose rows move from a guest to their new account. Profile is
 * handled separately because an existing account's settings win.
 */
export const movableTables = [
  checkIn,
  memoryCard,
  conversation,
  message,
  step,
  stepVersion,
  stepReport,
  note,
  weeklyReview,
  person,
  reachOut,
  reminder,
  pushSubscription,
  safetyEvent,
] as const;
