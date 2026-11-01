# Roadmap — Qualent

Status: approved 2026-11-01. Requirement IDs (FR-n) refer to [PRD.md](PRD.md).

Milestones run in order, because each depends on the ones before it. A task is done only when its "Done when" is true and CI passes. There are no dates yet: we estimate after M1 shows the real pace.

## M0: Before code (7Gence)

Start now, alongside M1. None of these need code.

| # | Task | Done when |
|---|---|---|
| 0.1 | Start Meta Business Verification | Verified status shows in Business Manager |
| 0.2 | ~~Confirm rights to reuse the ROI-Maxi design~~ | Done 2026-11-01: it is the owner's own design |
| 0.3 | Ask UAE counsel about PDPL and hosting in India | Written opinion on file, and any change raised with the team |
| 0.4 | Check trademark and domain for "Qualent" | Trademark checked and a domain bought (`qualent.com` is taken) |
| 0.5 | Create Vercel, Supabase and Sentry accounts, a Telegram bot, and a Meta app | Keys stored in a password manager, not in chat or the repo |
| 0.6 | Check each pilot client's ad mix | List shows how much spend runs on Click-to-WhatsApp ads |

## M1: Foundation

Goal: an empty app runs in Mumbai and the risky hosting assumptions are tested.

| # | Task | Done when |
|---|---|---|
| 1.1 | Git repo, Next.js 16, TypeScript, Tailwind 4, `design/theme.css` | `npm run dev` shows a themed page in light and dark |
| 1.2 | CI: lint, types, tests, license check, physical-CSS lint | A failing test or banned license blocks merge |
| 1.3 | Staging and production Supabase projects in Mumbai; Drizzle migrations through a separate role | `npm run db:migrate` works from CI on both |
| 1.4 | Vercel project in `bom1` on the Hobby plan | The app runs, and all routes respond |
| 1.5 | Run `supabase/cron.sql` | Due jobs run within about a minute, and the health check stays green |
| 1.6 | pg-boss with delayed jobs, run on demand | A delayed job waits, then runs, and queued jobs survive a crash |
| 1.7 | Measure the database round trip and test the connection poolers | Numbers recorded in ADR-0004; `SET LOCAL` confirmed on the transaction pooler |
| 1.8 | Sentry, with personal data scrubbed, and an external uptime check | A test error appears in Sentry with no personal data |
| 1.9 | Heartbeat and `/api/health` | Health fails when ticks stop for 20 minutes, and recovers on the next tick |

## M2: Tenancy and security

Goal: data isolation is proven before any lead data exists.

| # | Task | Done when |
|---|---|---|
| 2.1 | `tenants`, `profiles`, `members`; `app_user` role with no bypass | Migrations run; the role cannot bypass row-level security |
| 2.2 | `withTenant()` and forced row-level security (FR-1) | A missing tenant raises an error rather than returning data |
| 2.3 | CI isolation test | Fails if any `tenant_id` table lacks row-level security, or if tenant A can read or write tenant B |
| 2.4 | Login, staff MFA, tenant switcher (FR-3) | Staff without MFA cannot enter the Workspace |
| 2.5 | Role permission map (FR-2) | A test covers every role against every action |
| 2.6 | Audit log trigger (FR-4) | Changes are logged, and `app_user` cannot edit or delete log rows |
| 2.7 | App shell and core UI parts: button, input, select, dialog, menu, toast, table. Check Mobbin before choosing layouts and flows | Keyboard and contrast checks pass at phone and desktop widths |
| 2.8 | Client time zone and currency settings (FR-48) | Dates and money display using each client's settings, tested for Dubai and New York |

## M3: Lead core

Goal: staff can work leads entered by hand.

| # | Task | Done when |
|---|---|---|
| 3.1 | `contacts`, `leads`, `touches`, with composite foreign keys | A cross-tenant reference fails at the database |
| 3.2 | `ingestLead()` with phone normalizing and duplicate rules (FR-9, FR-11) | Tests cover new, duplicate, phone/email conflict and unparsable phone |
| 3.3 | Manual entry with source and campaign picker (FR-8) | A lead added by hand appears with its source |
| 3.4 | Pipelines, stages, two templates, `stage_history` (FR-12) | Applying a template creates a client's own editable copy |
| 3.5 | Board view with keyboard alternative (FR-14) | A stage can be changed by drag and by keyboard |
| 3.6 | Lead table with filters, bulk edit, saved views (FR-14) | A saved view restores filters and columns |
| 3.7 | Lead page and timeline; notes; call logging (FR-15, FR-16) | A call is logged in two clicks and appears in the timeline |
| 3.8 | Tasks and "today" list (FR-17) | Overdue and due-today tasks are listed correctly in the client's time zone |
| 3.9 | Custom fields (FR-13) | An invalid value is rejected by the server; a field is filterable |
| 3.10 | CSV import and export (FR-8) | A sample file imports with duplicates handled and a row-level error report |

## M4: Automatic intake

Goal: real leads arrive without anyone typing them.

| # | Task | Done when |
|---|---|---|
| 4.1 | `webhook_inbox` plus intake job (FR-10) | Replaying the same event twice creates one lead; a crash mid-job loses nothing |
| 4.2 | Landing page endpoint and snippet (FR-7) | A test page lead arrives with UTM, `fbc`, `fbp`, `event_id` and consent; spam checks work |
| 4.3 | Encrypted `connections`; Meta Page connection | Tokens are unreadable in the database; a bad token shows on the screen |
| 4.4 | Meta Lead Ads webhook with signature check (FR-6) | A Meta test lead becomes a CRM lead with campaign IDs; a bad signature is rejected |
| 4.5 | 15-minute safety poll (FR-6) | A lead with its webhook blocked still arrives |
| 4.6 | New-lead inbox | Unassigned leads are listed, and none can be missed |
| 4.7 | Submit Meta App Review, using this working flow as the demo | Submitted. Approval is tracked as an external risk |

## M5: Telegram and routing

Goal: leads reach a person within seconds, and results come back.

| # | Task | Done when |
|---|---|---|
| 5.1 | Bot, webhook secret, member linking (FR-21) | A link binds a member once and fails after 15 minutes |
| 5.2 | Rate-limited Telegram queue (FR-25) | `429 retry_after` is honored; a permanent failure shows on the lead |
| 5.3 | Team alerts with masked phone (FR-22) | A new lead alerts the group; measured under 10 seconds from webhook receipt |
| 5.4 | Routing modes and working hours (FR-18) | Tests cover round robin, weights, rules and out-of-hours |
| 5.5 | Reply timer and reassignment (FR-19) | No response moves the lead; `max_reassigns` stops the loop; a logged call cancels it |
| 5.6 | Qualify and deliver to a client agent (FR-23) | The agent receives the lead privately with full phone |
| 5.7 | Result buttons (FR-24) | A tap updates the stage; a tap from the wrong person is refused; a repeat tap changes nothing |

## M6: Meta Conversions API

Goal: results reach Meta correctly.

| # | Task | Done when |
|---|---|---|
| 6.1 | Hashing with known-value tests (FR-28) | Tests match expected hashes; `lead_id`, `fbc` and `fbp` stay unhashed |
| 6.2 | `capi_events` written and queued in one transaction | A forced rollback leaves neither the stage change nor the event |
| 6.3 | Meta form payload (FR-27) | Events appear in Events Manager with the test code |
| 6.4 | Landing page payload with Pixel dedup (FR-29) | Meta shows browser and server events deduplicated |
| 6.5 | Stage mapping screen with warning (FR-26) | Turning off a stage warns on Conversion Leads clients |
| 6.6 | Retry, backoff and 7-day expiry (FR-30) | Tests cover retry, expiry and a permanent error alert |
| 6.7 | Test mode with production guard (FR-31) | Production refuses a test code, tested |
| 6.8 | Health page (FR-32) | Shows volume against 200 a month, conversion rate, and sent, failed and expired counts |

## M7: Automation

| # | Task | Done when |
|---|---|---|
| 7.1 | Rule storage and triggers (FR-20) | Each trigger fires once on a newly matching lead |
| 7.2 | Steps, with delayed jobs that re-check conditions | A lead that changed during a wait does not run the next step |
| 7.3 | Loop and enrollment guards | Tests cover double enrollment and depth 3 |
| 7.4 | Simple rule screen | A manager builds "enter stage → wait 1 day → create task" without help |

## M8: AI

| # | Task | Done when |
|---|---|---|
| 8.1 | `aiRun()`, `ai_models`, and the OpenAI-format adapter (FR-41) | A schema-checked result returns; a model swap needs only a config change |
| 8.2 | Choose the model and read its terms | Choice, terms and price recorded in ADR-0007 |
| 8.3 | No-training routing (FR-41) | A test proves lead tasks refuse a `no_training = false` model |
| 8.4 | Placeholder replacement (FR-43) | Tests cover names, phones and emails, including Arabic text |
| 8.5 | Budget ledger and stop (FR-42) | Warns at 80%; stops at 100%; leads still flow and show as unscored |
| 8.6 | AI test set, including Arabic and JSON reliability | The chosen model passes, or we pick another and record why |
| 8.7 | Score, summary and next step (FR-36 to FR-38) | Output appears on the lead; slow AI does not delay alerts |
| 8.8 | Reply drafts (FR-39) | Copy works; nothing can be sent automatically |
| 8.9 | Prompt-injection test | A lead message containing instructions cannot change anything beyond schema fields |

## M9: Reports and Client Portal

| # | Task | Done when |
|---|---|---|
| 9.1 | Daily and intraday spend sync (FR-33) | Numbers match Ads Manager for a sample week; a mismatched time zone or currency warns |
| 9.2 | Client report (FR-34) | Cost per qualified lead matches a hand calculation; manual leads are labeled |
| 9.3 | Team report (FR-35) | Numbers match a seeded test set |
| 9.4 | Portal with `client_viewer` (FR-2) | A viewer cannot reach any individual lead record, tested |
| 9.5 | Brand settings with contrast resolver (FR-5) | A sweep test passes at 4.5:1 or better across colors |
| 9.6 | Weekly ad analysis with Kimi and staff review (FR-40) | A test proves the payload has no personal data; nothing reaches a client unreviewed |
| 9.7 | Confirm Kimi K3.1 Pro price | Price table updated from the console |

## M10: Privacy, hardening and pilot

| # | Task | Done when |
|---|---|---|
| 10.1 | Consent capture check (FR-44) | Each intake path stores source, text and time |
| 10.2 | Export and erase one contact (FR-45) | Personal fields are gone; reports keep counts; the action is audited |
| 10.3 | Retention job (FR-46) | Old data is removed per client, tested |
| 10.4 | Data processing agreement and sub-processor list | Reviewed by counsel |
| 10.5 | Backups to separate storage, and a restore drill | Restored in staging, with time recorded against the 4-hour target |
| 10.6 | Ops alerts, dead-letter view, health page complete | A forced failure alerts the ops Telegram group |
| 10.7 | Security review of webhooks, roles and secrets | No high-severity findings left open |
| 10.8 | Phone-width review of every screen (FR-47) | All main tasks work at phone width in both themes |
| 10.9 | Pilot on 7Gence's own leads for 2 weeks | PRD section 4 measures reported; blockers fixed |
| 10.10 | First client onboarded | App Review approved, counsel's opinion on file, and client running live |

## After v1

Decide from pilot data: WhatsApp connection, client logins, Arabic screens, then the US deployment. Reasons and costs are in [FEATURES.md](FEATURES.md).
