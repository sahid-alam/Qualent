CREATE SCHEMA "ops";
--> statement-breakpoint
CREATE TABLE "ops"."worker_heartbeat" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"beat_at" timestamp with time zone NOT NULL,
	CONSTRAINT "worker_heartbeat_single_row" CHECK ("ops"."worker_heartbeat"."id" = 1)
);
