# Feature List

## What the app does, screen by screen

Status: updated 2026-11-02 after the screens were simplified to four menu items. "Needs keys" means the code exists and is tested locally, but has never run against the real service.

### Who uses it
| Person | Where | What they do |
|---|---|---|
| 7Gence staff (agent) | Today, Leads | Call leads, log results, send qualified leads on |
| 7Gence manager | Everything except System | Also assign leads, see the team's numbers, change settings |
| 7Gence admin | Everything | Also add clients and watch System health |
| Client's sales agent | Telegram only, no login | Gets qualified leads, taps Contacted, Viewing, Won or Lost |
| Client | Client report, no lead records | Sees cost per qualified lead on their own branded page |

### 1. Today: who to call next
| Feature | What it does | Status |
|---|---|---|
| Call list | Leads waiting on you, best first, with one big Call button on the top lead | Works |
| Follow-ups due | Tasks due today or late, with a Done button | Works |
| Reminders | Shows only when needed: leads with no owner, or a connection still missing | Works |

### 2. Leads: every lead, three ways to see them
| Tab | What it does | Status |
|---|---|---|
| New | Leads nobody owns, oldest first. Tick and assign | Works |
| All | Search, filter by stage or temperature, bulk edit, CSV import and export | Works |
| Board | Drag leads between stages, or use the move icon on the card | Works |

Adding a lead by hand is on all three tabs.

### 3. Lead page: one person
| Feature | What it does | Status |
|---|---|---|
| Call and stage | Call button and a stage dropdown at the top | Works |
| Log a call | Pick the result, save. Two clicks | Works |
| Notes | Notes and calls, newest at the bottom | Works |
| Follow-ups | Add one with a date. It then shows on Today | Works |
| Send to client's agent | Appears once a lead is qualified. Sends it on Telegram | Screen works, sending needs keys |
| AI summary, score, next step, reply draft | Suggestions only, never sent by itself | Needs an AI model chosen |
| History and privacy | Folded away: what happened, consent, export or erase | Works |

### 4. Reports: did the ads work
| Feature | What it does | Status |
|---|---|---|
| Client report | Leads, cost per lead, cost per qualified lead, deals per campaign | Works on sample data; real spend needs Meta keys |
| Team report | Leads per person, first reply time, leads reaching each stage | Works |
| Client view | The same report with the client's name, logo and color | Works |
| Weekly ad analysis | AI draft that staff approve before the client sees it | Needs an AI model chosen |

### 5. Settings: set up once, then leave alone
| Tab | What it does | Status |
|---|---|---|
| Setup | Connect Meta and Telegram, choose who gets leads, add people, landing page form, test lead. Optional: branding, time zone, stages, custom fields | Screen works, connections need keys |
| Meta | Which stages are sent to Meta, send a test event, events sent and failed | Screen works, sending needs keys |
| Automations | Rules such as "enters Viewing, wait 1 day, create a task" | Works; timed steps need the scheduler or `npm run worker` |
| System | 7Gence admins only: scheduler, failed jobs, health per client, AI models | Works |

### Happens by itself
| Feature | What it does | Status |
|---|---|---|
| Meta form leads | Arrive by webhook, with a check every 15 minutes for any missed | Needs keys |
| Landing page leads | Arrive from a pasted form, with ad tracking | Tested locally |
| Duplicate check | Same phone or email updates the same person | Works |
| Auto-assign | Takes turns or uses rules, within working hours | Works |
| Reassign if no reply | Moves the lead on and tells the manager | Works |
| Telegram alerts | New lead, hot lead, no reply, Meta errors | Needs keys |
| Results to Meta | Each stage change is sent once, hashed, with retries, within Meta's 7-day limit | Needs keys |
| Ad spend sync | Daily spend per campaign, for the cost numbers | Needs keys |
| Auto-delete | Removes old data per client's retention setting | Works |

### Not built yet
Staff two-step login (MFA), invite emails and password reset. All three need Supabase. These should be finished before the first client.

## Connecting Meta: what's needed

1. **Meta Business Verification**, then App Review for lead access. Outside our control, and it can take weeks.
2. **Hosting first.** Meta webhooks need a public address, so Supabase and Vercel come before Meta. Steps are in [DEPLOY.md](DEPLOY.md).
3. **App keys** in the environment: `META_APP_SECRET`, `META_VERIFY_TOKEN`.
4. **For each client**, in Settings > Setup: Facebook Page ID and token, dataset (Pixel) ID and Conversions API token, ad account ID and token.
5. **Check it** with Settings > Meta > Send a test event, then a Meta test lead.

---

## Original feature decisions

Status: updated 2026-11-01 with your Checkpoint 1 answers and your four architecture decisions (1a, 2b, 3a, 4b).

Words used below:
- **Client account** = one client's own separate space. Clients never see each other's data.
- **Lead** = a person who filled a form or messaged us and might buy.
- **Pipeline** = the steps a lead moves through (for example New → Contacted → Viewing → Won).
- **CAPI** = Meta Conversions API. We tell Meta which leads became good leads, so Meta finds more people like them.

**Who uses what in v1:** 7Gence staff work leads in the CRM. Client sales agents get leads on Telegram and do not log in. Clients log in only to see reports.

---

## Must have for v1

### Accounts and access
| Feature | What it does | Why it matters to us |
|---|---|---|
| Client accounts | Each client has a separate space. 7Gence staff switch between them. | We run many clients from one place, and their data stays apart. |
| Staff roles | Admin, Manager, Agent. Agents can be limited to their own leads. | Our team sees only what it should. |
| Client report login | Clients see their reports only, not individual lead records. | Clients get proof of results without extra access. |
| Activity log | Records who changed what and when. | Trust, debugging, and privacy law. |
| Basic white-label | Client's logo, colors and name on their report portal. | Reports look like their own. |
| Privacy tools | Saved consent, export or erase one person's data, auto-delete old data. | Needed for UAE privacy law, and consent cannot be added later. |

### Getting leads in
| Feature | What it does | Why it matters to us |
|---|---|---|
| Meta Lead Ads intake | Form leads arrive directly from Meta, with a safety check every 15 minutes for any missed. | Speed-to-lead, and no lost leads. |
| Landing page intake | A form or code snippet sends leads in, with ad tracking info. | Many campaigns send traffic to landing pages. |
| Manual lead entry | Staff add a lead by hand and pick its source and campaign. | How WhatsApp leads get in for now. |
| Ad tracking on every lead | Saves campaign, ad set, ad, UTM and click IDs. | Proves which ads bring buyers, not just leads. |
| Duplicate check | Same phone or email updates the existing person. | Clean data and fair lead counts. |
| New-lead inbox | All new, unassigned leads in one list. | Nothing gets lost. |
| CSV import / export | Bring leads in, take data out. | Onboarding clients with existing lists. |

**WhatsApp note:** there is no WhatsApp connection in v1 (your decision). Leads from "Click to WhatsApp" ads must be typed in by hand, and the CRM cannot send Meta any results for them. Campaigns where Meta needs to optimize on lead quality should use Meta forms or a landing page.

### Working leads
| Feature | What it does | Why it matters to us |
|---|---|---|
| Lead page with timeline | Details, notes, calls and stage changes, in time order. | Staff see the whole story at a glance. |
| Pipelines (board view) | Drag leads between stages. Each client has its own stages. | The core daily screen. |
| Pipeline templates | "UAE Real Estate" and "General Lead Gen" first, applied in one click. | Fast setup across industries. |
| Custom fields | Add fields per client, for example budget or area. | One product serves several industries. |
| Lead table with filters | Sort, filter, bulk edit, saved views. | Managers slice leads fast. |
| Auto-assign leads | Take turns, weighted, or by rules, within working hours. | Fair and instant sharing. |
| Reassign if no reply | No contact within X minutes moves the lead on and tells the manager. | A clear selling point. |
| Tasks and reminders | Follow-up tasks on a "today" list. | Follow-ups actually happen. |
| Notes and call logging | Log a call result in two clicks. Staff call from their own phone. | Data for AI and reports. |
| Simple automations | "When a lead enters stage X → wait 1 day → create task / alert / move stage." | Follow-ups without manual work. |

### Telegram
| Feature | What it does | Why it matters to us |
|---|---|---|
| Team alerts | New lead, hot lead and no-reply alerts for 7Gence staff. | Instant reaction from the phone. |
| Lead delivery to client agents | Qualified leads go to the client's sales agent with name, phone and AI summary. | This is how clients receive leads, without logging in. |
| Result buttons | Agent taps Contacted, Viewing, Won or Lost. | Without this we do not learn results, and Meta does not either. |

### Meta CAPI
| Feature | What it does | Why it matters to us |
|---|---|---|
| Stage → Meta event mapping | All stages on by default, changeable per client. | Meta finds more quality leads. |
| Safe sending | Phone and email are scrambled first (SHA-256 hashing, a one-way code). Each event is sent once. Failures retry. | Privacy and accurate numbers. |
| Test events | A test button and a test mode for checking setup. | Catches mistakes before they affect ads. |
| Health check | Shows lead volume against Meta's needs, plus failed events. | We spot problems before the client does. |

Note: events are sent only for Meta form and landing page leads. Leads typed in by hand send none, because they have no Meta ID to match.

### Reports
| Feature | What it does | Why it matters to us |
|---|---|---|
| Ad spend sync | Pulls daily spend per campaign from Meta. | Needed for cost reports. |
| Client report | Leads, cost per lead, **cost per qualified lead**, and deals per campaign. | Our main sales tool. |
| Team report | Response time, leads per person, conversion per stage. | Managers see who needs help. |

### AI
| Feature | What it does | Why it matters to us |
|---|---|---|
| Lead scoring | Hot, warm or cold, with a reason. | Staff call the best leads first. |
| Note summaries | Short summary of call notes and any chat text staff paste in. No call recordings in v1. | Fast handover to the client's agent. |
| Ad performance analysis | Weekly: which ads bring good leads, not just cheap ones. | Better ad decisions and better client reports. |
| Next best step | Suggests one action per lead. | Staff know what to do next. |
| Reply drafts | Writes a draft to copy into WhatsApp. Never sent automatically. | Faster replies. |
| Swappable AI models | Change the model in settings, not in code. | Prices change fast, as Kimi's just did. |
| AI cost limit per client | A monthly budget, with a warning at 80% and a stop at 100%. | No surprise bills. |

### Basics
| Feature | What it does | Why it matters to us |
|---|---|---|
| Works on phones | Mobile browser support. | Staff are often away from a desk. |
| Light and dark mode | Same look as the reference, improved. | Matches the design you like. |
| Time zones, currencies, phone format | Per client, with one world phone format (E.164). | Ready for the US later. |

---

## Later (after v1)

| Feature | Why later |
|---|---|
| WhatsApp ad leads, arriving automatically | Your decision 4b. Needs Meta's coexistence feature, which removes some phone app features and is unconfirmed for UAE numbers. |
| WhatsApp replies inside the CRM | Your 5b. Needs paid API messages and template approval. |
| SMS and email follow-ups | Your 5c. Needs sender setup per client. US SMS has strict rules (TCPA). |
| Telegram chat with leads | Your "maybe" on 3c. A lead must open the bot first. Decide after real demand. |
| Client sales agents logging in | Their member record already exists, so we can invite them later. |
| Showing individual leads to clients | Reports only for now. |
| Full Telegram bot commands | Result buttons cover v1. |
| Phone calls as a lead source, recording, call summaries | Needs a phone provider. |
| Property portals (Property Finder, Bayut, Dubizzle) | Their APIs are not public. |
| Property / listing records | Not needed for lead handling. |
| Visual automation builder | Simple rules cover most needs. |
| Arabic screens (right-to-left) | You chose English only. The CSS is ready, so adding it later is mostly translation and testing. |
| Custom domain, own email or WhatsApp sender | You chose logo, colors and name for now. |
| Resellers | Only if we sell to other agencies. |
| In-app billing | We invoice outside the app. |
| Public API and outbound webhooks | After the core is stable. |
| US region | A second deployment of the same code, plus TCPA and state privacy tools. |
| Google / TikTok ads | Meta first. |

## Skip

| Feature | Why skip |
|---|---|
| Website / funnel builder | Other tools do this well. We only need form intake. |
| Email newsletters | Use a dedicated tool. |
| Quotes, invoices, payments | Deals close outside the CRM. |
| Our own phone system | Use a provider instead. |
| App marketplace, courses, communities | GoHighLevel extras that do not help speed-to-lead. |
| Forking an open-source CRM | **Decided by you, 2026-10-25: no fork.** We take features and ideas from all of them. Actual code comes only from permissive projects such as Atomic CRM (MIT). |

## Assumptions (tell me if wrong)
- v1 is web only, with no native mobile app.
- We invoice clients outside the app in v1.
- The CRM sends no messages to leads in v1. People contact leads from their own phones.
