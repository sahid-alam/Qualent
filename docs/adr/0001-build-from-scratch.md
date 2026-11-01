# ADR-0001: Build from scratch, no fork

Status: Accepted, 2026-10-25, by the owner.

**Context:** the product is hosted and white-labeled for paying clients. Twenty, EspoCRM, SuiteCRM and NocoBase carry AGPL or branding terms that conflict with this, and the owner wants full ownership.

**Decision:** do not fork any CRM. Take ideas from any product. Copy code only from MIT or Apache sources, such as Atomic CRM, and keep their notices.

**Consequences:** more to build at first, but no license risk. CI checks dependencies against a license allowlist. Never copy from AGPL, GPL or "Enterprise"-licensed files.
