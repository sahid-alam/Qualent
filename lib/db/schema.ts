import { sql } from "drizzle-orm";
import { check, pgSchema, smallint, timestamp } from "drizzle-orm/pg-core";

// Not in `public`, so Supabase's auto-generated API never exposes it.
export const ops = pgSchema("ops");

export const workerHeartbeat = ops.table(
  "worker_heartbeat",
  {
    id: smallint().primaryKey().default(1),
    beatAt: timestamp("beat_at", { withTimezone: true }).notNull(),
  },
  (t) => [check("worker_heartbeat_single_row", sql`${t.id} = 1`)],
);
