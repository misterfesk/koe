// Deterministic first layer of Koe's safety check. It runs everywhere people
// type (chat, thoughts, journal, step notes), including when AI is off, and
// never depends on a model. It deliberately over-triggers: a false alarm costs
// one gentle question; a miss can cost far more. A model-based check adds a
// second layer for indirect wording in conversation.
//
// UNREVIEWED: these patterns and the response policy are engineering defaults
// and still need review by a qualified clinician before real-user release.

export type RiskLevel = "none" | "concern" | "urgent";

// Explicit intent, plan, means, or an act already under way.
const urgent: RegExp[] = [
  /\b(kill|hang|shoot|drown)(ing)? my ?self\b/,
  /\bend(ing)? (it all|my life|things)\b/,
  /\b(want|going|ready|plan(ning)?) to end it\b/,
  /\bkms\b/,
  /\bunaliv(e|ing) my ?self\b/,
  /\b(take|taking|took) my (own )?life\b/,
  /\bcommit(ting)? suicide\b/,
  /\bsuicid(e|al)\b.*\b(tonight|today|now|plan|planned|ready|going to)\b/,
  /\b(tonight|today|now|plan|planned|ready|going to)\b.*\bsuicid(e|al)\b/,
  /\b(overdos(e|ed|ing)|od'?d)\b/,
  /\b(took|swallowed) (all|a bunch of|the whole|too many) .*\b(pills|tablets|meds)\b/,
  /\b(sav(ed|ing)|stockpil\w*|hoard\w*|collect(ed|ing)) (up )?(\w+ ){0,2}(pills|tablets|meds)\b/,
  /\b(pills|tablets|meds)\b.*\b(tonight|saved up|stockpiled)\b/,
  /\b(jump|jumping) (off|from|in front of)\b/,
  /\bgoodbye (forever|everyone|world)\b/,
  /\b(wrote|writing|left) (a|my) (suicide|goodbye) note\b/,
  /\bdon'?t want to (live|be alive) anymore\b/,
];

// Passive death wishes, self-harm, hopelessness about being alive.
const concern: RegExp[] = [
  /\bsuicid(e|al)\b/,
  /\bwant(ed)? to die\b/,
  /\bwish (i was|i were|i'?d been) (dead|never born)\b/,
  /\b(better off|be better) without me\b/,
  /\bbetter off (if|when) i('?m| was| were| am)? (gone|dead|not here|not around)\b/,
  /\bdon'?t want to (live|be alive)\b/,
  /\bunalive\b/,
  /\bwant(ed)? to disappear\b/,
  /\bdon'?t want to (be here|wake up|exist)\b/,
  /\b(no|isn'?t a|not any) (point|reason) (in |to )?(living|being alive|going on)\b/,
  /\bcan'?t (go on|do this anymore|keep going)\b/,
  /\b(self[- ]?harm|cut(ting)? myself|hurt(ing)? myself|burn(ing)? myself)\b/,
  /\bno one would (miss|notice|care) (me|if i)\b/,
  /\b(life|living) (isn'?t|is not|isn't) worth\b/,
  /\bnot worth living\b/,
];

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectRisk(text: string): RiskLevel {
  const t = normalise(text);
  if (!t) return "none";
  if (urgent.some((re) => re.test(t))) return "urgent";
  if (concern.some((re) => re.test(t))) return "concern";
  return "none";
}

export function highest(...levels: RiskLevel[]): RiskLevel {
  if (levels.includes("urgent")) return "urgent";
  if (levels.includes("concern")) return "concern";
  return "none";
}

// Helplines the model might still write despite instructions. Numbers shown
// to people come only from the verified Help listings.
/** True if text names a helpline, a phone number or a web address. */
export function mentionsContact(text: string) {
  const digits = (m: string) => m.replace(/\D/g, "").length;
  const long = text.match(/\+?\d[\d\s().-]{5,}\d/g) ?? [];
  if (long.some((m) => digits(m) >= 7)) return true;
  if (/https?:\/\/|www\.|\.(org|com|net|gov)\b/i.test(text)) return true;
  if (
    /\b(hotline|helpline|lifeline|samaritans|crisis (line|text|team))\b/i.test(
      text,
    )
  )
    return true;
  // Short emergency and crisis numbers, only next to a calling word.
  return /\b(call|text|dial|ring|phone|contact)\b[^.\n]{0,25}\b(988|911|999|112|000|111|1737|116\s?123|13\s?11\s?14)\b/i.test(
    text,
  );
}
