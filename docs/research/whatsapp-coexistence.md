# WhatsApp Coexistence — Findings Kept for Later

Last checked: 2026-11-01. Not in v1 ([ADR-0008](../adr/0008-no-whatsapp-in-v1.md)). Check all of this again before building it.

Evidence labels match [ARCHITECTURE.md](../ARCHITECTURE.md).

## What it is

If a number moves fully to the Cloud API, it stops working in the WhatsApp Business app. Meta's **coexistence** feature keeps the number on both [Official].

## What we would get

- Incoming messages with ad data (`ctwa_clid`).
- Agents' replies from the app also reach us as `smb_message_echoes` events [Official], so first reply can be measured automatically and threads summarized.
- Messages sent from the app stay free [Official].

## What it costs the client [Official]

- No voice or video call sync, group sync, or broadcast lists (existing lists turn read-only).
- Greeting and away messages, quick replies and labels are not supported on the Cloud API side, per Meta's comparison table. Check how these behave in the app.
- Disappearing messages and live location are turned off for one-to-one chats.
- Linked devices are unlinked and must be re-linked. WhatsApp for Windows is not supported.
- Throughput is capped. Meta's page says 20 messages per second; another source says 5. Not a concern for receive-only use.

## Risks

- **UAE eligibility is unconfirmed.** Recent secondary sources say only Nigeria and South Africa are excluded, and older ones list more countries. None names the UAE. [UNVERIFIED] Test with one real number first.
- **7Gence may need Meta Tech Provider status or a partner such as 360dialog** to run the Embedded Signup flow. [UNVERIFIED]

## Privacy rule if built

A business number also receives messages from friends and existing customers. Create a lead only when a message carries ad referral data, or when a tenant turns on "treat all new chats as leads". Discard everything else without storing it.

## Meta events for WhatsApp ad leads

| Item | Value |
|---|---|
| Mechanism | CAPI for Business Messaging [Official] |
| `action_source` | `business_messaging`, with `messaging_channel=whatsapp` |
| Match keys | `ctwa_clid`, `whatsapp_business_account_id`; the fallback needs `page_id` and hashed data |
| Event names | **Limited list:** `LeadSubmitted`, `QualifiedLead`, `Purchase` and others. The FAQ lists them for the product overall |
| All stages? | **No.** Only stages mapping to a supported name can be sent |
| Setup | One dataset per WhatsApp account, created by API |
| Permissions | `whatsapp_*`, including `whatsapp_business_manage_events` with advanced access [Official for the last; others UNVERIFIED] |
| Hashing | `ctwa_clid` is not hashed |

## What a build would add

One intake adapter, one event shape, a `ctwa_clid` column on `touches`, a `whatsapp` connection kind, and `first_response_at` set from message echoes.
