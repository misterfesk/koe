/** DEMO data for the Reflection report. Made up; replace with real data later. */
export type Level = "low" | "okay" | "more";

export const levelLabels: Record<Level, string> = {
  low: "Low",
  okay: "Okay",
  more: "More",
};

// 28 days, 1 Oct to 28 Oct 2026: a rough patch in week 2, a slow lift after.
const l: Level[] = [
  "okay",
  "okay",
  "low",
  "okay",
  "more",
  "low",
  "low",
  "low",
  "low",
  "low",
  "okay",
  "low",
  "low",
  "okay",
  "okay",
  "low",
  "okay",
  "okay",
  "more",
  "more",
  "okay",
  "okay",
  "more",
  "okay",
  "more",
  "more",
  "okay",
  "more",
];

export const demoReport = {
  name: "Demo Person",
  period: "1 Oct to 28 Oct 2026",
  prepared: "29 Oct 2026",
  source: "Koe check-ins and entries (demo)",
  energy: l,
  weeks: [
    { label: "Week 1", done: 6, partly: 3, notToday: 5 },
    { label: "Week 2", done: 3, partly: 2, notToday: 8 },
    { label: "Week 3", done: 7, partly: 4, notToday: 4 },
    { label: "Week 4", done: 9, partly: 3, notToday: 3 },
  ],
  things: [
    "Update my CV · moved forward 4 times",
    "Email the landlord · done",
    "Repot the plants · moved forward twice",
  ],
  helped: [
    "A short walk after lunch",
    "Music while cooking",
    "Texting my sister on Sundays",
  ],
  notes: [
    { date: "9 Oct 2026", text: "Slept badly all week. Ask about sleep." },
    { date: "22 Oct 2026", text: "Mornings are easier since the walks." },
  ],
};
