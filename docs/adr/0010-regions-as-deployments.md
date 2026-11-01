# ADR-0010: A new region is a separate deployment

Status: Accepted, 2026-11-01.

**Context:** the US comes later, with its own data and privacy rules.

**Decision:** each region is its own copy of the same code, with its own database and login URL. There is no cross-region data and no routing layer. `tenants.region`, time zone, currency and E.164 phones exist from day one.

**Consequences:** simple and clear for data residency. Migrations and deploys run once per region, and a user in two regions has two logins. US launch still needs TCPA and state privacy work, with US counsel.
