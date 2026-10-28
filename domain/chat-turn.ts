import { z } from "zod";

/** Reserved for the local inline control; never send it as a model option. */
export const OTHER_OPTION_ID = "__other";
const optionSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((id) => id !== OTHER_OPTION_ID),
  label: z.string().trim().min(1).max(240),
});

export const chatAskSchema = z
  .object({
    kind: z.enum(["single", "multi", "text"]),
    options: z.array(optionSchema).max(11).optional(),
    allowOther: z.boolean(),
    placeholder: z.string().max(300).optional(),
    info: z.string().max(600).optional(),
  })
  .superRefine((ask, ctx) => {
    const options = ask.options ?? [];
    if (
      (ask.kind === "single" && (options.length < 1 || options.length > 5)) ||
      (ask.kind === "multi" && options.length < 1) ||
      (ask.kind === "text" && options.length > 0) ||
      new Set(options.map((option) => option.id)).size !== options.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Use distinct options within the ask limit.",
      });
    }
  });

export const chatTurnSchema = z.object({
  message: z.string().trim().min(1).max(6000),
  ask: chatAskSchema.optional(),
  phase: z.string().trim().min(1).max(100),
});
export type ChatAsk = z.infer<typeof chatAskSchema>;
export type ChatTurn = z.infer<typeof chatTurnSchema>;

export const plainTextAsk: ChatAsk = {
  kind: "text",
  allowOther: false,
  placeholder: "e.g. Updating my CV. I open it, then close it again.",
};

/** Structural validation only. Callers still own input/output safety checks. */
export function parseChatTurn(input: unknown): ChatTurn {
  const result = chatTurnSchema.safeParse(input);
  return result.success
    ? result.data
    : {
        message: "What would you like to share?",
        ask: { ...plainTextAsk },
        phase: "fallback",
      };
}
