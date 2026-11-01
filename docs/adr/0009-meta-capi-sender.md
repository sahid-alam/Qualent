# ADR-0009: One Meta event sender with two payload shapes

Status: Accepted, 2026-11-01.

**Context:** Meta form leads and landing page leads use different mechanisms, and the owner wants all stages sent by default with a per-client override.

**Decision:**
- One sender, picking Conversion Leads or Pixel-plus-CAPI by the lead's first touch.
- Every stage on by default, stored per stage.
- Later-stage `event_id` is `{lead_id}:{stage_id}`. Landing page leads share their first event's ID with the Pixel.
- Retry with backoff; events over 7 days old are marked expired, not sent.
- Production refuses test event codes.

**Consequences:** re-entering a stage never sends twice. Leads with no Meta ID send nothing. Clients under about 200 leads a month may not get optimization, and the health page says so honestly. A wrong hash fails silently, so hashing has known-value tests.
