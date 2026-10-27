CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"est_cost_usd" numeric(12, 6),
	"ok" boolean NOT NULL,
	"fell_back" boolean DEFAULT false NOT NULL,
	"tool_calls_dropped" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_user_idx" ON "agent_run" USING btree ("user_id","created_at");