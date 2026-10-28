CREATE TABLE "piece" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"week_item_id" text NOT NULL,
	"data_enc" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"started_on" date NOT NULL,
	"review_on" date NOT NULL,
	"label_enc" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approval_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"week_id" text NOT NULL,
	"captured_enc" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_week_item_id_week_item_id_fk" FOREIGN KEY ("week_item_id") REFERENCES "public"."week_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week" ADD CONSTRAINT "week_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_item" ADD CONSTRAINT "week_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_item" ADD CONSTRAINT "week_item_week_id_week_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."week"("id") ON DELETE cascade ON UPDATE no action;