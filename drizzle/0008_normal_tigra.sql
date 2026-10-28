ALTER TABLE "step" ADD COLUMN "week_item_id" text;--> statement-breakpoint
ALTER TABLE "step" ADD CONSTRAINT "step_week_item_id_week_item_id_fk" FOREIGN KEY ("week_item_id") REFERENCES "public"."week_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "step_week_item_idx" ON "step" USING btree ("week_item_id");