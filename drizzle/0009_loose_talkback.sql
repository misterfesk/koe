CREATE TABLE "conversation_summary" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"takeaways_enc" text NOT NULL,
	"upto_message_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "context_kind" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "context_id" text;--> statement-breakpoint
ALTER TABLE "conversation_summary" ADD CONSTRAINT "conversation_summary_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summary" ADD CONSTRAINT "conversation_summary_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;