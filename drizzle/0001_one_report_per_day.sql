DROP INDEX "step_report_step_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "step_report_step_day_idx" ON "step_report" USING btree ("step_id","day");