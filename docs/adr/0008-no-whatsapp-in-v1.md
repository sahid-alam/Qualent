# ADR-0008: No WhatsApp connection in v1

Status: Accepted, 2026-11-01, by the owner (decision 4b).

**Context:** Meta's coexistence feature would let a number work in both the phone app and the CRM. It removes some phone app features, is unconfirmed for UAE numbers, and may need a Meta partner.

**Decision:** no WhatsApp connection in v1. Staff enter these leads by hand with a source and campaign.

**Consequences:**
- Client phones keep working as they do today, and App Review needs fewer permissions.
- **Click-to-WhatsApp ads cannot be attributed automatically and send no Meta events**, because Meta's `ctwa_clid` arrives only on the inbound message. A campaign code in a `wa.me` link is a manual tag only.
- Reply time comes from logged calls, notes and Telegram taps.
- Campaigns needing quality optimization should use Meta forms or landing pages.

**Revisit if:** pilot clients spend heavily on Click-to-WhatsApp ads. Adding it later needs one intake adapter, one event shape and one column.
