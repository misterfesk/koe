import { breaksGuardrails, mentionsExercise, mentionsFood } from "./plan-menu";
import { detectRisk, mentionsContact, normalise } from "./safety";
import {
  pieceSchema,
  type CapturedThing,
  type Piece,
  type WeekDraft,
} from "./week";

export const stockPhrases =
  /\b(one tiny thing|small wins?|baby steps|you['’]ve got this|be gentle with yourself|self[- ]care|one step at a time|no pressure|every little bit counts|proud of you|journey|it['’]s okay not to be okay)\b/i;
const contact = /\b(call|phone|text|contact|message|email|send|book|visit)\b/i;
const unsafe =
  /\b(we|us|together|let['’]?s|steps?|diagnos\w*|medicat\w*|dose|cure|treat depression|illegal|steal|weapon|fasting|calories|lose weight|restrict food|purge)\b/i;
const unsafeAction =
  /\b(start|try|seek|book|get|practice)\b.{0,30}\b(therapy|therapist|counselling|treatment)\b|\b(run|exercise|workout|train)\b.{0,40}\b(pain|collapse|exhaustion|without eating)\b|\b(ignore|push through)\b.{0,25}\bpain\b|\b(fraud|arson|trespass|shoplift)\b/i;
const minuteWords = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];
const minuteNumber =
  "(\\d{1,2}|twenty[ -](?:one|two|three|four|five)|" +
  [...minuteWords].reverse().join("|") +
  ")";
/** Explicit available minutes only: a deadline or completed work is not a time budget. */
export function statedAvailabilityMinutes(
  thing: CapturedThing,
  originalWords = "",
): number | null {
  const words = [...Object.values(thing), originalWords]
    .filter(Boolean)
    .join("\n");
  const patterns = [
    new RegExp(
      "\\b" +
        minuteNumber +
        "\\s*(?:minutes?|mins?)\\s+(?:free|available|at a time|to spare)\\b",
      "gi",
    ),
    new RegExp(
      "\\b(?:only\\s+(?:have|got)|(?:have|got)\\s+(?:only|up to|at most|no more than)|can\\s+(?:only\\s+)?(?:spare|manage|spend))\\s+" +
        minuteNumber +
        "\\s*(?:minutes?|mins?)\\b",
      "gi",
    ),
  ];
  const limits: number[] = [];
  for (const pattern of patterns)
    for (const match of words.matchAll(pattern)) {
      const prefix = words.slice(Math.max(0, match.index! - 25), match.index);
      if (/\b(not|used to|no longer)\b[^.\n]*$/i.test(prefix)) continue;
      const value = match[1].toLowerCase();
      const number = /^\d+$/.test(value)
        ? Number(value)
        : value.startsWith("twenty-") || value.startsWith("twenty ")
          ? 20 + minuteWords.indexOf(value.slice(7)) + 1
          : minuteWords.indexOf(value) + 1;
      if (number > 0 && number <= 25) limits.push(number);
    }
  return limits.length ? Math.min(...limits) : null;
}
const destructiveActions = [
  /\bshred(?:s|ded|ding)?\b/i,
  /\brecycl(?:e[ds]?|ing)\b/i,
  /\bdiscard(?:s|ed|ing)?\b/i,
  /\btoss(?:es|ed|ing)?\b/i,
  /\bdelet(?:e[ds]?|ing)\b/i,
  /\bthrow(?:s|n|ing)?\b(?:\s+\w+){0,3}\s+away\b/i,
];
function requestedDestruction(
  action: RegExp,
  thing: CapturedThing,
  originalWords: string,
) {
  return [thing.what, thing.left, originalWords].some((words) =>
    words
      .replace(/[‘’]/g, "'")
      .split(/[.!\n]/)
      .some((sentence) => {
        const match = action.exec(sentence);
        if (
          !match ||
          /\?|\b(should|could|would|whether|already|used to|finished|shredded|recycled|discarded|tossed|deleted|threw)\b/i.test(
            sentence,
          )
        )
          return false;
        const prefix = sentence.slice(0, match.index);
        return !/\b(not|never|don't|do not|without)\b[^,;]*$/i.test(prefix);
      }),
  );
}
function suggestsDestruction(action: RegExp, words: string) {
  return words
    .replace(/[‘’]/g, "'")
    .split(/[.!?\n]/)
    .some((sentence) => {
      const match = action.exec(sentence);
      return (
        !!match &&
        !/\b(not|never|don't|do not|without|nothing)\b[^,;]*$/i.test(
          sentence.slice(0, match.index),
        )
      );
    });
}
/** Message-drafting examples belong only to contact work, not essays or playlists. */
function messageContext(thing: CapturedThing, originalWords: string) {
  return /\b(email|e-mail|message|letter|postcard|sms|phone|call|reply)\b|\btext\s+(?:message|to)\b|\btalk\s+to\b/i.test(
    [thing.what, thing.left, originalWords].join("\n"),
  );
}
/** Generated text only. A number of minutes is allowed; contact numbers are not. */
export function safeInterviewText(
  text: string,
  eatingConcern = false,
  chat = true,
) {
  return (
    !stockPhrases.test(text) &&
    !unsafe.test(normalise(text)) &&
    !unsafeAction.test(normalise(text)) &&
    !mentionsContact(text) &&
    !breaksGuardrails(text) &&
    detectRisk(text) === "none" &&
    (chat || !/\b(i|me|my|mine)\b/i.test(text)) &&
    (!eatingConcern ||
      (!mentionsFood(text) &&
        !mentionsExercise(text) &&
        !/\b(weight|fit|diet)\b/i.test(text)))
  );
}
export function pieceIssues(
  piece: Piece,
  thing: CapturedThing,
  eatingConcern = false,
  originalWords = "",
): string[] {
  if (!pieceSchema.safeParse(piece).success) return ["shape"];
  const issues: string[] = [];
  if (piece.minutes > { tiny: 5, small: 15, medium: 25 }[piece.size])
    issues.push("size");
  const available = statedAvailabilityMinutes(thing, originalWords);
  if (available !== null && piece.minutes > available)
    issues.push("availability");
  const generated = [piece.title, piece.endpoint, piece.when].join("\n");
  if (
    destructiveActions.some(
      (action) =>
        suggestsDestruction(action, generated) &&
        !requestedDestruction(action, thing, originalWords),
    )
  )
    issues.push("destructive");
  if (
    /\bunsent\b|\b(?:do not|don't) send\b|\b(?:draft|write)\b.{0,30}\b(?:email|message|letter|text message)\b/i.test(
      generated,
    ) &&
    !messageContext(thing, originalWords)
  )
    issues.push("unrelated_message");
  for (const text of [piece.title, piece.endpoint, piece.when])
    if (!safeInterviewText(text, eatingConcern, false)) issues.push("words");
  if (!safeInterviewText(piece.sourcePhrase, eatingConcern))
    issues.push("words");
  const requested = thing.what + " " + thing.left;
  const sending = /\bsend\b/i.test(piece.title + " " + piece.endpoint);
  const explicitlyRequested = sending
    ? /\b(send|sending)\b/i.test(requested) &&
      !/\b(not|never|don['’]?t|do not|without)\b.{0,20}\b(send|sending)\b/i.test(
        requested,
      )
    : /\b(call|phone|text|contact|message|email|book|visit)\b/i.test(requested);
  if (
    contact.test(piece.title + " " + piece.endpoint) &&
    !/\b(draft|unsent|do not send|don't send)\b/i.test(
      piece.title + " " + piece.endpoint,
    ) &&
    !explicitlyRequested
  )
    issues.push("contact");
  if (
    /\b(i (sent|called|booked)|automatically|on your behalf|already sent)\b/i.test(
      piece.title + " " + piece.endpoint,
    )
  )
    issues.push("contact");
  if (
    !Object.values(thing).some(
      (value) => !!value && value.includes(piece.sourcePhrase),
    )
  )
    issues.push("source");
  return [...new Set(issues)];
}
export function weekIssues(draft: WeekDraft, eatingConcern = false) {
  return draft.items.flatMap((item) =>
    item.pieces.flatMap((piece) =>
      pieceIssues(piece, item.captured, eatingConcern),
    ),
  );
}
/** Personal words are only interpolated after checks; unsafe subjects yield no proposal. */
export function fallbackPieces(
  thing: CapturedThing,
  eatingConcern = false,
  originalWords = "",
): Piece[] {
  const choices = [thing.what, thing.left];
  const phrase = choices.find((t) => t && safeInterviewText(t, eatingConcern));
  if (!phrase) return [];
  const cleaned = phrase
    .split(/[.!?]/)[0]
    .replace(/^I (want to |need to )?/i, "")
    .replace(/^(?:maybe|perhaps)\s+/i, "")
    .replace(/\bmy\b/gi, "your")
    .replace(/^(?:only|just)\s+/i, "")
    .replace(/\s+(?:is|are)\s+left$/i, "")
    .replace(
      /^(sort|update|write|finish|answer|read|organise|organize|prepare|complete)\b/i,
      (verb) =>
        ({
          sort: "sorting",
          update: "updating",
          write: "writing",
          finish: "finishing",
          answer: "answering",
          read: "reading",
          organise: "organising",
          organize: "organising",
          prepare: "preparing",
          complete: "completing",
        })[verb.toLowerCase()]!,
    )
    .replace(/^(?:the|an?|updating|writing|sorting|answering)\b/i, (word) =>
      word.toLowerCase(),
    )
    .trim();
  const target =
    cleaned.length > 45 ? cleaned.slice(0, 45).replace(/\s+\S*$/, "") : cleaned;
  const isContact = messageContext(thing, originalWords);
  const minutes = Math.min(
    10,
    statedAvailabilityMinutes(thing, originalWords) ?? 10,
  );
  const minuteLabel = minutes === 1 ? "minute" : "minutes";
  const piece: Piece = {
    title: isContact
      ? `Draft two unsent lines${/\bemail\b/i.test(target) ? " for the email" : ""}`
      : `Spend ${minutes} ${minuteLabel} on ${target}`,
    size: minutes <= 5 ? "tiny" : "small",
    minutes,
    endpoint: isContact
      ? "Stop with two unsent lines"
      : `Stop after ${minutes} ${minuteLabel} on ${target}`,
    when: "When you next have a quiet moment",
    sourcePhrase: phrase,
  };
  return pieceIssues(piece, thing, eatingConcern, originalWords).length
    ? []
    : [piece];
}
