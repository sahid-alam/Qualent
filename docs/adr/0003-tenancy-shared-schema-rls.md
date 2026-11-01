# ADR-0003: Shared schema with forced row-level security

Status: Accepted, 2026-11-01.

**Context:** client data must never mix, and we expect many small clients. A schema per tenant makes every migration N times the work.

**Decision:** one schema with `tenant_id` on every row. Forced row-level security, `withTenant()` using `SET LOCAL`, a non-bypass `app_user` role, composite foreign keys, and no browser database access. A CI test fails on any gap. No agency layer.

**Consequences:** cheap to run, and migrations stay simple. Every query must go through `withTenant()`. A very large or strict client can get its own deployment of the same code.
