CREATE TABLE "plan_day" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"energy" text,
	"mode" text DEFAULT 'normal' NOT NULL,
	"snapshot_enc" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_model" (
	"user_id" text PRIMARY KEY NOT NULL,
	"data_enc" text NOT NULL,
	"summary_enc" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "step" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "step" ADD COLUMN "minute_of_day" integer;--> statement-breakpoint
ALTER TABLE "step" ADD COLUMN "why_enc" text;--> statement-breakpoint
ALTER TABLE "step" ADD COLUMN "size" text;--> statement-breakpoint
ALTER TABLE "step" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "plan_day" ADD CONSTRAINT "plan_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_model" ADD CONSTRAINT "user_model_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_day_user_day_idx" ON "plan_day" USING btree ("user_id","day","version");