# ADR-0006: Telegram delivery with result buttons, no agent login

Status: Accepted, 2026-11-01, by the owner (decision 1a).

**Context:** client agents do not log in, yet "Viewing" and "Won" happen on their side. Without that data, reassignment, late-stage Meta events and cost-per-deal reports all fail.

**Decision:** one shared bot delivers qualified leads privately. Inline buttons (Contacted, Viewing, Won, Lost) update the stage after checking the person owns the lead. A client agent is a `members` row with a null `user_id`.

**Consequences:** lowest effort for clients, and they can be invited to log in later using the same row. Telegram becomes a sub-processor holding lead data, so group alerts are masked. Data is thin if agents ignore the buttons, so the health page tracks this per client. Failed deliveries must alert, never fail silently.
