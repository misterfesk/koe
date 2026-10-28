import { describe, expect, it } from "vitest";
import { goals } from "@/domain/intake";
import {
  buildResourceQuery,
  resourceInterests,
  resourceFormats,
} from "@/domain/resources";
import { orderedSources, sourceForUrl } from "@/domain/sources";
import {
  cachedResourceOk,
  resourceRuleReason,
  pickWhy,
  templateWhy,
  whyOk,
} from "@/domain/resource-screen";
import { shelfWeek } from "@/server/data/shelf";

const hit = {
  title: "Looking after your day",
  url: "https://www.nhs.uk/mental-health/low-mood",
  content:
    "A practical guide for adults looking after themselves while feeling low. There are simple ideas to consider at your own pace and ways to choose what fits your day.",
};
describe("Shelf pure safety rules", () => {
  it.each([
    "https://library.sheffieldchildrens.nhs.uk/read",
    "https://selfhelp.cntw.nhs.uk/read",
    "https://nhs.uk.evil.com/read",
    "http://www.nhs.uk/read",
    "https://me:secret@www.nhs.uk/read",
    "https://www.nhs.uk:444/read",
    "https://youtube.com/read",
  ])("rejects untrusted URL %s", (url) => expect(sourceForUrl(url)).toBeNull());
  it("accepts only exact https source hosts and orders by region", () => {
    expect(sourceForUrl(hit.url)?.name).toBe("NHS");
    expect(
      orderedSources("AU")
        .slice(0, 2)
        .map((s) => s.region),
    ).toEqual(["AU", "AU"]);
    expect(orderedSources("US")[2].region).toBe("global");
  });
  it.each([
    "/children",
    "/young-people",
    "/teen",
    "/kids",
    "/%79oung-people",
    "/parents-of",
  ])("rejects young audiences %s", (path) =>
    expect(
      resourceRuleReason({ ...hit, url: "https://www.nhs.uk" + path }),
    ).toBe("young audience"),
  );
  it.each([
    "A guide for young people",
    "Advice for parents",
    "Medication dosage",
    "Suicide methods",
    "Calorie tracking",
    "This will make you feel better",
    "Crisis phone numbers",
  ])("rejects unsafe content %s", (title) =>
    expect(resourceRuleReason({ ...hit, title })).not.toBeNull(),
  );
  it("rejects thin snippets and applies local eating constraints", () => {
    expect(resourceRuleReason(hit)).toBeNull();
    expect(resourceRuleReason({ ...hit, content: "Too short." })).toBe(
      "thin result",
    );
    expect(
      resourceRuleReason({ ...hit, title: "Walking and low mood" }, true),
    ).toBe("eating concern");
  });
  it.each([
    "We explain practical ideas from clinical research for adults. You can use our guide to consider a bedtime routine, avoid alcohol before bed, and choose what fits your day.",
    "Clinical depression is a common name for depression. This adult self-help guide explains what low mood can feel like and describes ordinary ways to look after your day.",
    "Research shows that sleep and mood are connected. This guide brings the information together and explains how you might consider ordinary bedtime routines when feeling low.",
    "Our guide offers adult self-help ideas. Read with us about taking a break, choosing a familiar interest, and finding a manageable way to wind down before bed.",
  ])("allows ordinary publisher prose: %s", (content) => {
    expect(resourceRuleReason({ ...hit, content })).toBeNull();
  });
  it("does not impose Koe's pronoun rules on an external source title", () => {
    expect(
      resourceRuleReason({
        ...hit,
        title: "Our guide to sleep and clinical research",
      }),
    ).toBeNull();
    expect(whyOk("You can use our clinical guide to sleep.")).toBe(false);
  });
  it.each([
    [
      "You can take medication to change your sleep. Read this guide before choosing a dosage or changing a dose, including advice about tablets and when to take them.",
      "medication, dosage or supplements",
    ],
    [
      "Count calories and follow a strict diet to lose weight. This guide describes how to track every meal and change what you eat to alter your body size.",
      "diet, weight or calories",
    ],
    [
      "This guide explains sleep restriction and cutting back on your sleep. Try sleeping less than 5 hours each night until you feel tired at the desired time.",
      "unsafe sleep or alcohol advice",
    ],
    [
      "Drink alcohol to improve your sleep. This guide describes using wine to wind down at night and recommends a drink when your mood feels low and sleep is difficult.",
      "unsafe sleep or alcohol advice",
    ],
    [
      "This guide will make you feel better. You will enjoy these ideas and they will boost your mood when you use them during a difficult day at home.",
      "efficacy promise",
    ],
    [
      "Find a guaranteed miracle for low mood. This sensational guide reveals a shocking secret that doctors hide, and offers an instant cure for every adult.",
      "sensational claim",
    ],
    [
      "This is a crisis phone numbers listing. Find crisis phone numbers and call 988 or another crisis number for support, including contact details for local services.",
      "crisis or contact listing",
    ],
    [
      "This page includes suicide methods and self-harm details. It describes dangerous acts in detail and should never be selected as a general read for someone with low mood.",
      "risk language",
    ],
  ])("rejects actual unsafe snippet advice: %s", (content, reason) => {
    expect(resourceRuleReason({ ...hit, content })).toBe(reason);
  });
  it.each([
    "You can call 0412 345 678.",
    "You can visit www.madeup.org.",
    "You and I can try this.",
    "You have my advice.",
    "You can use our guide.",
    "You will feel better.",
    "You can try this together.",
  ])("rejects unsafe why line %s", (line) => expect(whyOk(line)).toBe(false));
  it("names a goal only when the person chose it", () => {
    expect(templateWhy({ goal: "sleep" }, ["sleep"])).toMatch(/^You chose/);
    expect(templateWhy({ goal: "through_day" })).toBe("");
    expect(templateWhy({ goal: "sleep" }, ["energy"])).toBe("");
    const claim = templateWhy({ goal: "sleep" }, ["sleep"]);
    expect(pickWhy(claim, { goal: "sleep" }, [])).toBe("");
    expect(pickWhy(claim, { goal: "sleep" }, ["sleep"])).toBe(claim);
    const plain = "A short page about getting through your day.";
    expect(pickWhy(plain, { goal: "through_day" }, [])).toBe(plain);
  });
  it("checks all fixed why lines and all enum query combinations", () => {
    for (const goal of goals) {
      expect(whyOk(templateWhy({ goal }, [goal]))).toBe(true);
      for (const interest of [...resourceInterests, undefined])
        for (const format of [...resourceFormats, undefined]) {
          const tags = { goal, interest, format };
          expect(buildResourceQuery(tags)).toBe(
            buildResourceQuery({ ...tags }),
          );
        }
    }
    for (const k of ["goal", "interest", "format", "region", "note"])
      expect(() =>
        buildResourceQuery({
          goal: "sleep",
          [k]: "secret-personal-words",
        } as never),
      ).toThrow();
  });
  it("revalidates cached metadata, hosts, titles and AI mode", () => {
    const r = {
      title: hit.title,
      url: hit.url,
      host: "www.nhs.uk",
      adult: true,
      foodOrExercise: true,
      aiScreened: true,
    };
    expect(cachedResourceOk(r, false, true)).toBe(true);
    expect(cachedResourceOk(r, true, true)).toBe(false);
    expect(
      cachedResourceOk(
        { ...r, url: "https://www.nhs.uk/children" },
        false,
        true,
      ),
    ).toBe(false);
    expect(
      cachedResourceOk({ ...r, title: "Medication dosage" }, false, true),
    ).toBe(false);
    expect(cachedResourceOk({ ...r, aiScreened: false }, false, true)).toBe(
      false,
    );
    expect(
      cachedResourceOk({ ...r, foodOrExercise: undefined }, false, true),
    ).toBe(false);
  });
  it("uses ISO weeks across year boundaries", () => {
    expect(shelfWeek("2021-01-01")).toBe("2020-W53");
    expect(shelfWeek("2026-10-27")).toBe("2026-W44");
  });
});
