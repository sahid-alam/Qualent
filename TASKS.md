# Qualent — Task List

Legend: [x] done · [~] in progress · [ ] not started · [!] waiting on you

## Planning (done)
- [x] Research, feature list, architecture, PRD, roadmap, decision records
- [x] Decisions: Telegram buttons, Mumbai on free Vercel for v1, no WhatsApp in v1, name Qualent, AI model later

## Waiting on you
- [!] Repo is PUBLIC: make it private, or confirm public, then I push
- [!] Keys and accounts when ready: Supabase, Vercel, Telegram bot, Meta app, Sentry
- [!] Move to Vercel Pro before the first paying client (free plan is non-commercial)
- [!] Meta Business Verification
- [!] UAE counsel: PDPL and hosting in India
- [!] Trademark and domain check for "Qualent" (qualent.com is taken)
- [!] Check how much client spend runs on Click-to-WhatsApp ads
- [!] Choose the AI model

## Backend (branch: backend, committed locally, tested on local Postgres)
- [x] M1 Foundation code, CI file, job runner, heartbeat, health
- [x] M2 Tenancy, row-level security, roles, audit log
- [x] M3 Leads, pipelines, stages, tasks, custom fields, filters, CSV
- [x] M4 Meta and landing page intake, inbox, safety poll
- [x] M5 Telegram linking, alerts, delivery, buttons; routing and reply timers
- [x] M6 Meta events: hashing, shapes, retries, expiry, test mode, health data
- [x] M7 Automation engine
- [x] M8 AI layer, with no model configured
- [x] M9 Spend sync, client and team reports (brand colors moved to the frontend phase)
- [x] M10 Consent, export, erase, retention (not backups or the pilot)

## Not done until you give keys
- [ ] Run against real Supabase, Vercel, Meta and Telegram
- [ ] Test supabase/cron.sql and pg-boss through the pooler
- [ ] Sentry, uptime check, backups and restore drill
- [ ] Supabase Auth session wiring (with the login screens)

## Frontend
- [x] Flows as an artifact, using Mobbin (docs/flows.html)
- [!] Approve the flows and answer the "Your call" questions  ← WAITING ON YOU
- [ ] Screens, after you approve the flows
