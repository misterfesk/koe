ALTER TABLE "check_in" ADD COLUMN "word_enc" text;--> statement-breakpoint
ALTER TABLE "plan_day" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "plan_day" ADD COLUMN "note_enc" text;--> statement-breakpoint
ALTER TABLE "step_report" ADD COLUMN "vs_expected" text;