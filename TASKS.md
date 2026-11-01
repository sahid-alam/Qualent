# Qualent — Task List

Legend: [x] done · [~] in progress · [ ] not started · [!] waiting on you

## Planning (done)
- [x] Research, feature list, architecture, PRD, roadmap, decision records
- [x] Decisions: Telegram buttons, Mumbai on free Vercel for v1, no WhatsApp in v1, name Qualent, AI model later
- [x] Flows approved 2026-11-01, with the defaults for each "Your call"
- [x] CLAUDE.md and .claude/settings.json

## Waiting on you
- [!] Review the screens
- [!] Keys and accounts when ready: Supabase, Vercel, Telegram bot, Meta app, Sentry
- [!] Move to Vercel Pro before the first paying client (free plan is non-commercial)
- [!] Meta Business Verification
- [!] UAE counsel: PDPL and hosting in India
- [!] Trademark and domain check for "Qualent" (qualent.com is taken)
- [!] Check how much client spend runs on Click-to-WhatsApp ads
- [!] Choose the AI model

## Built and tested locally (latest work on the frontend branch, pushed to the public GitHub repo; not merged to main)
- [x] Backend M1 to M10 code: tenancy, leads, intake, Telegram, Meta events, automation, AI layer, reports, privacy
- [x] Screens: Today, New leads, Pipeline board, All leads, Lead page, Reports, Automations, Meta results, Client setup, Privacy, New client, Client Portal, Login
- [x] Phones, light and dark mode, role access checked in a browser
- [x] Screens reworked to match the ROI-Maxi Ember look: Today dashboard, three-panel lead page, Performance-style Reports, grouped sidebar

## Finished from a check of the PRD against the code
- [x] Meta pages subscribe to webhooks when saved; bad tokens show at once; ad account time zone and currency mismatch warns
- [x] Telegram: setWebhook script, group links that can't land in a private chat, buttons that survive reordering stages
- [x] First admin script, profile on first sign-in, new admin lands on New client
- [x] Landing page snippet with UTM, click IDs, Pixel event ID and consent, checked in a browser; no raw JSON for visitors
- [x] Edit pipeline stages; custom fields defined, filtered, and yes/no and number values stored correctly
- [x] Bulk stage change; working hours, weight and own-leads limit per person; client settings for budget, retention, time zone, currency
- [x] Automation assign and tag steps, a temperature condition, days for "goes quiet"
- [x] Meta errors reach the team group; warning when a stage is off; test button refused in production
- [x] Exports include every matching lead and honor all filters; exports are audited
- [x] System page: scheduler, queues, per-client health, failed jobs with retry, AI models; permanent failures alert ops
- [x] Sentry over HTTP, off until a DSN is set; security headers; not-found page; sidebar collapse; campaign row on Today
- [x] docs/DEPLOY.md and docs/PRIVACY.md
- [x] Independent code review (roadmap 10.7): 12 findings, all fixed with tests where the risk was real. Erasing a contact could delete other clients' waiting leads; failed automations stuck silently; agent links could send full phones to a group; deactivated agents kept Telegram access; bulk assign skipped the reply timer

## Needs your keys before it can be finished
- [ ] Run against real Supabase, Vercel, Meta and Telegram, following docs/DEPLOY.md
- [ ] Real sign-in: tested only with the local sign-in so far
- [ ] Staff two-step login (MFA): not built, needs Supabase
- [ ] Invite emails and password reset: not built, needs Supabase. Until then, add people in Supabase by hand
- [ ] Test supabase/cron.sql and pg-boss through the pooler
- [ ] Confirm a Sentry event arrives; uptime check; backups and restore drill
- [ ] Measure lead-to-alert time against the 10-second target (not recorded by the app yet)
- [ ] AI test set, once a model is chosen
- [ ] Pilot on 7Gence's own leads
