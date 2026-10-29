CREATE TABLE "shelf_cover_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text,
	"data_base64" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shelf_item" ADD COLUMN "format" text DEFAULT 'article' NOT NULL;--> statement-breakpoint
ALTER TABLE "shelf_item" ADD COLUMN "video_id" text;--> statement-breakpoint
ALTER TABLE "shelf_item" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "shelf_item" ADD COLUMN "read_minutes" integer;--> statement-breakpoint
ALTER TABLE "week_item" ADD COLUMN "topic" text;