import { breaksGuardrails, mentionsExercise, mentionsFood } from "./plan-menu";
import { detectRisk, mentionsContact, normalise } from "./safety";

export const stockPhrases =
  /\b(one tiny thing|small wins?|baby steps|you['’]ve got this|be gentle with yourself|self[- ]care|one step at a time|no pressure|every little bit counts|proud of you|journey|it['’]s okay not to be okay)\b/i;
/** UX-AND-COPY §2b: phrasing that reads as generated rather than written. */
export const aiTells =
  /—|\b(it sounds like|that['’]s a great|absolutely|great question|i hear you|here['’]s|let['’]s dive in|gently|gentle|journey|lean into|unlock\w*|empower\w*|mindful\w*|hold space)\b/i;
export function hasAiTell(text: string) {
  return aiTells.test(text);
}
const unsafe =
  /\b(we|us|together|let['’]?s|diagnos\w*|medicat\w*|dose|cure|treat depression|illegal|steal|weapon|fasting|calories|lose weight|restrict food|purge)\b/i;
const unsafeAction =
  /\b(start|try|seek|book|get|practice)\b.{0,30}\b(therapy|therapist|counselling|treatment)\b|\b(run|exercise|workout|train)\b.{0,40}\b(pain|collapse|exhaustion|without eating)\b|\b(ignore|push through)\b.{0,25}\bpain\b|\b(fraud|arson|trespass|shoplift)\b/i;
/** Generated or edited text only. A number of minutes is allowed; contact numbers are not. */
export function safeInterviewText(text: string, eatingConcern = false) {
  return (
    !stockPhrases.test(text) &&
    !hasAiTell(text) &&
    !unsafe.test(normalise(text)) &&
    !unsafeAction.test(normalise(text)) &&
    !mentionsContact(text) &&
    !breaksGuardrails(text) &&
    detectRisk(text) === "none" &&
    (!eatingConcern || eatingSafe(text))
  );
}
/** No food, exercise, weight or diet words; for the eating-concern rule. */
export function eatingSafe(text: string) {
  return (
    !mentionsFood(text) &&
    !mentionsExercise(text) &&
    !/\b(weight|fit|diet)\b/i.test(text)
  );
}
/** A model question about more things: only the server asks that. */
export const asksForMore =
  /\b(anything else|another thing|any other things?|something else|more things?)\b/i;
/** One short sample answer: "e.g." without a comma, and never a list of three. */
export function samplePlaceholder(text: string | undefined) {
  const value = (text ?? "").trim().replace(/^e\.g\.,\s*/i, "e.g. ");
  const commas = value.match(/,/g)?.length ?? 0;
  if (
    !value ||
    commas >= 2 ||
    (commas === 1 && /,[^,]*\b(and|or)\b/i.test(value))
  )
    return "e.g. Update my CV";
  return value;
}
