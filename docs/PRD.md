# Product Requirements — Qualent

Status: approved 2026-11-01.
Related: [ARCHITECTURE.md](ARCHITECTURE.md) (how it works), [FEATURES.md](FEATURES.md) (plain-English list), [ROADMAP.md](ROADMAP.md) (build order).

## 1. Problem

7Gence runs Meta ads for clients. Today three things go wrong:

- **Leads wait.** A slow first reply wastes the ad spend that produced the lead.
- **Meta optimizes on the wrong thing.** It sees form fills, not which leads became qualified or bought, so it finds more cheap leads rather than better ones.
- **Clients only see cost per lead.** 7Gence cannot easily prove cost per qualified lead or cost per deal.

## 2. Product

A multi-tenant, white-label CRM that 7Gence runs for its clients. It gets every lead to a person within seconds, tracks each lead through a pipeline, sends the results back to Meta, and shows clients results by campaign.

## 3. Users

| User | Uses | Does |
|---|---|---|
| 7Gence admin | Workspace | Sets up clients, connections and AI settings |
| 7Gence manager | Workspace | Runs a client's leads, routing, automations and reports |
| 7Gence agent | Workspace, Telegram | Contacts and qualifies leads, logs calls and notes |
| Client sales agent | **Telegram only, no login** | Receives qualified leads and taps results |
| Client viewer | Client Portal | Sees branded reports, not individual leads |

## 4. Goals for v1

Targets are proposals, to be confirmed during the pilot.

| Goal | Measure | Target |
|---|---|---|
| Fast alerts | Time from our webhook receiving a lead to the Telegram alert | Under 10 seconds for 95% of leads |
| No lost leads | Leads in Meta missing from the CRM after the 15-minute safety check | 0 |
| Results reach Meta | Eligible stage events accepted by Meta within the 7-day limit | At least 95% |
| Client results data | Delivered leads with at least one Telegram result tap | At least 70% per client |
| Data isolation | Cross-client data access | 0, enforced by a CI test |
| AI cost control | Client months over budget | 0, enforced by a hard stop |

## 5. Scope

### 5.1 Accounts and access
- **FR-1** Each client is a separate tenant. Data never crosses tenants.
- **FR-2** Roles: `platform_admin`, `manager`, `agent`, `client_viewer`, plus `field_agent` with no login. Agents can be limited to their own leads.
- **FR-3** Staff must use MFA.
- **FR-4** An append-only audit log records who changed what, including exports and erasures.
- **FR-5** The Client Portal shows each client's logo, colors and name. A brand color that fails contrast is adjusted, and the screen says so.

### 5.2 Lead intake
- **FR-6** Meta Lead Ads leads arrive by webhook, with a poll every 15 minutes to catch any missed.
- **FR-7** Landing pages post leads with UTM values, click IDs, a Pixel `event_id` and consent text. The endpoint has a rate limit, honeypot and allowed origins.
- **FR-8** Staff can add a lead by hand with a source and campaign, or import a CSV. CSV export is also available.
- **FR-9** Every source goes through one function. Duplicates match on phone, then email. If they conflict, phone wins and the lead is flagged.
- **FR-10** Incoming events are saved before processing, so a crash or slow API loses nothing. Running the same event twice changes nothing.
- **FR-11** Phone numbers are stored in E.164. A number that cannot be parsed is kept and flagged, never dropped.

### 5.3 Working leads
- **FR-12** Pipelines per client, created from a template. "UAE Real Estate" and "General Lead Gen" ship first.
- **FR-13** Custom fields per client, validated on the server and filterable.
- **FR-14** Board view with drag and a keyboard alternative. Table view with sort, filter, bulk edit and saved views.
- **FR-15** Lead page with one timeline: notes, calls, stage changes, assignments and AI output.
- **FR-16** Call result logged in two clicks. Chat text can be pasted into a note.
- **FR-17** Tasks with due dates and a "today" list.
- **FR-18** Assignment by round robin, weight or rule, counting working hours only in the client's time zone.
- **FR-19** If no first response arrives in the set time, the lead moves on and the manager is alerted. After the maximum reassignments, it stops with the manager.
- **FR-20** Automation rules: trigger, conditions, then steps (wait, create task, Telegram alert, move stage, assign, tag). A lead enrolls once per rule, and rule chains stop at depth 3.

### 5.4 Telegram
- **FR-21** One shared bot. People link through a one-time link that expires in 15 minutes.
- **FR-22** Team alerts go to a per-client group with masked phone numbers: new lead, hot lead, no reply, Meta errors.
- **FR-23** Qualified leads go privately to the client's agent with name, phone, what they asked and an AI summary.
- **FR-24** Result buttons (Contacted, Viewing, Won, Lost) update the stage after checking the person owns the lead. Each update flows on to reports and Meta.
- **FR-25** Failed deliveries retry. A permanent failure shows on the lead and alerts staff.

### 5.5 Meta Conversions API
- **FR-26** Each stage maps to a Meta event. All are on by default and changeable per client. Turning off a stage on a Conversion Leads client shows a warning.
- **FR-27** Two payload shapes: Meta form leads and landing page leads. Manual leads send nothing unless they carry a real Meta ID.
- **FR-28** Personal data is SHA-256 hashed after normalizing, with a known-value test.
- **FR-29** Each event has a stable `event_id`, so re-entering a stage never sends twice. Landing page events share their ID with the Pixel.
- **FR-30** Failures retry with backoff. Events older than 7 days are marked expired and not sent.
- **FR-31** A test mode and "Send test event" button, which production refuses to use.
- **FR-32** A health page per client shows lead volume against Meta's needs, and events sent, failed and expired.

### 5.6 Reports
- **FR-33** Daily ad spend per campaign, ad set and ad from Meta.
- **FR-34** Client report: leads, cost per lead, cost per qualified lead and deals per campaign. Leads tagged by hand are labeled as manual.
- **FR-35** Team report: response time, leads per person, conversion per stage.

### 5.7 AI
All AI output is a suggestion. Nothing is ever sent automatically.

- **FR-36** Lead score: 0–100, hot, warm or cold, with a reason. Alerts never wait for it.
- **FR-37** Short summaries of notes and pasted chat.
- **FR-38** One suggested next step per lead.
- **FR-39** Reply drafts on request, with a copy button and `wa.me` link.
- **FR-40** Weekly ad analysis per client, using campaign numbers only. Staff review it before a client sees it.
- **FR-41** Models change through config, with no code change. Lead data only reaches models marked no-training.
- **FR-42** Monthly budget per client: warning at 80%, stop at 100%. Leads keep flowing, marked as unscored, never given a fake score.
- **FR-43** Names, phones and emails are replaced with placeholders before lead-related AI calls. The model gets no tools and returns schema-checked fields only.

### 5.8 Privacy
- **FR-44** Each contact stores consent source, exact text and time.
- **FR-45** Export one contact's data, or erase it while keeping anonymous counts in reports.
- **FR-46** Automatic deletion after a per-client retention period.

### 5.9 Basics
- **FR-47** Works in mobile browsers, in light and dark mode, in English.
- **FR-48** Time zone and currency per client.

## 6. Not in v1

- **WhatsApp connection of any kind.** Consequence: Click-to-WhatsApp leads are typed in by hand and send no Meta events.
- The CRM sending any message to a lead (WhatsApp, SMS or email).
- Client agents or clients working individual leads through a login.
- Arabic screens, custom domains, a visual automation builder, in-app billing, a public API.
- Call recording, property portal connections, Google or TikTok ads.
- US launch. Time zone, currency and consent fields are ready, and it deploys later as a second copy.

Full list: [FEATURES.md](FEATURES.md).

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Hosting | Supabase and Vercel in Mumbai, on free plans for v1 |
| Recovery | At most 5 minutes of data lost, restored within 4 hours (proposal), with a quarterly restore drill |
| Privacy in logs | No phone numbers, emails or message text in logs |
| Secrets | Encrypted at rest with the key held in the environment only. All webhooks verify signatures |
| Accessibility | WCAG AA contrast and full keyboard use, per [DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md) |
| Licenses | MIT or Apache dependencies, checked in CI. No code copied from AGPL or GPL projects |

## 8. Assumptions

- Web only, with no native app. Clients are invoiced outside the app.
- Staff and client agents contact leads from their own phones.
- A client agent will tap Telegram buttons. If not, staff follow up, and the health page shows which clients are thin on data.
- Most campaigns can run on Meta forms or landing pages. This matters because of the WhatsApp decision.

## 9. Dependencies and open items

| Item | Owner | Why it matters |
|---|---|---|
| Meta Business Verification and App Review | 7Gence | Outside our control and could take weeks. Blocks real client leads |
| UAE counsel on PDPL and hosting in India | 7Gence | Should be settled before signing the first client |
| Vercel Pro | 7Gence | Hobby is non-commercial. Needed before the first paying client |
| AI model | 7Gence | Decided later. AI features stay off until then, and leads show as unscored |
| Scheduler and pg-boss on real Supabase | Engineering | Untested until the projects exist |
