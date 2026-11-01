# ADR-0005: pg-boss queues, run on demand, with a webhook inbox

Status: Accepted, 2026-11-01. The on-demand runner replaces the always-on worker because of ADR-0004.

**Context:** reply timers and automations need delayed jobs, and leads must survive crashes and slow APIs. Vercel's free plan has no usable always-on worker, and its cron runs once a day.

**Decision:**
- pg-boss on the same Postgres, with no Redis. Jobs are added in the same transaction as the data change.
- Webhooks save the raw event to `webhook_inbox`, queue a job, reply, then process the fast queues right away with `after()`. That is what keeps alerts quick.
- Supabase's scheduler (`supabase/cron.sql`) checks every minute inside Postgres and calls `/api/cron/tick` only if a job is due, so an idle system costs almost no Vercel usage. It also calls every 15 minutes for the heartbeat and periodic work.
- `npm run worker` runs the same code in a loop, for local development or a future always-on host.

**Consequences:**
- One fewer service, and we never get a stage change without its Meta event.
- A delayed job can run up to about a minute late, which is fine for reply timers.
- pg-boss adds load to the main database.
- **Not yet tested on Supabase:** `supabase/cron.sql`, and pg-boss through the transaction pooler. Both are in M1.

**Ceiling:** if this outgrows the free plan, keep the code and run `worker/index.ts` always-on. If pg-boss itself is the bottleneck, move to BullMQ with Redis.
