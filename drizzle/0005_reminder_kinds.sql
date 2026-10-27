ALTER TABLE "reminder" ALTER COLUMN "step_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder" ADD COLUMN "kind" text DEFAULT 'item' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_morning_idx" ON "reminder" USING btree ("user_id") WHERE "reminder"."kind" = 'morning_plan';