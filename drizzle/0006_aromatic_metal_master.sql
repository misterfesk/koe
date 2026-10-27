CREATE TABLE "resource_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelf_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"host" text NOT NULL,
	"title" text NOT NULL,
	"why_enc" text NOT NULL,
	"tags_key" text NOT NULL,
	"week" text NOT NULL,
	"status" text DEFAULT 'current' NOT NULL,
	"food_or_exercise" boolean NOT NULL,
	"ai_screened" boolean NOT NULL,
	"feedback_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelf_refresh" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_key" text NOT NULL,
	"week" text NOT NULL,
	"tags_key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"retry_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shelf_item" ADD CONSTRAINT "shelf_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_refresh" ADD CONSTRAINT "shelf_refresh_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shelf_user_url_unique" ON "shelf_item" USING btree ("user_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "shelf_refresh_request_unique" ON "shelf_refresh" USING btree ("user_id","request_key");