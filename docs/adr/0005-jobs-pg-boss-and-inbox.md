# ADR-0005: pg-boss queues and a webhook inbox

Status: Accepted, 2026-11-01.

**Context:** reply timers and automations need delayed jobs, and leads must survive crashes and slow APIs.

**Decision:** pg-boss on the same Postgres, with no Redis. Webhooks save the raw event to `webhook_inbox`, queue a job, and reply right away. Jobs are added in the same transaction as the data change.

**Consequences:** one fewer service, and we never get a stage change without its Meta event. pg-boss adds load to the main database and needs a session pooler or direct connection. If it becomes the bottleneck, move to BullMQ with Redis.
