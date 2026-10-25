export type ToneSetting="expressive"|"calm"|"plain";export type Energy="low"|"steady"|"more"|"unknown";export type ToneContext="welcome"|"chosen"|"done"|"setback"|"reflection"|"help";
export function tone(setting:ToneSetting,context:ToneContext,energy:Energy){
const mode=setting==="plain"?"plain":setting==="calm"||energy==="low"||["setback","reflection","help"].includes(context)?"calm":"expressive";
const copy={
expressive:{welcome:"A little room for what matters.",chosen:"A step that's yours. Take it at your pace.",done:"You made room for something that matters.",setback:"We can leave it here, or try a different shape.",reflection:"There is no right answer here.",help:"Human support, at your pace."},
calm:{welcome:"One thing at a time.",chosen:"Your step is here when you want it.",done:"Your experience is recorded.",setback:"We can leave it here, or try a different shape.",reflection:"There is no right answer here.",help:"Human support, at your pace."},
plain:{welcome:"Choose an optional step.",chosen:"Step chosen.",done:"Report recorded.",setback:"Report recorded. Adjustment is optional.",reflection:"Optional reflection.",help:"Support resources."}};
return {mode,message:copy[mode][context]};}