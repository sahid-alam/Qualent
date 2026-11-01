# Qualent — Task List

Legend: [x] done · [~] in progress · [ ] not started · [!] waiting on you

## Planning (done)
- [x] Research, feature list, architecture, PRD, roadmap, decision records
- [x] Decisions: Telegram buttons, Mumbai on free Vercel for v1, no WhatsApp in v1, name Qualent, AI model later
- [x] Flows approved 2026-11-01, with the defaults for each "Your call"
- [x] CLAUDE.md and .claude/settings.json

## Waiting on you
- [!] Repo is PUBLIC: make it private, or confirm public, then I push
- [!] Review the screens
- [!] Keys and accounts when ready: Supabase, Vercel, Telegram bot, Meta app, Sentry
- [!] Move to Vercel Pro before the first paying client (free plan is non-commercial)
- [!] Meta Business Verification
- [!] UAE counsel: PDPL and hosting in India
- [!] Trademark and domain check for "Qualent" (qualent.com is taken)
- [!] Check how much client spend runs on Click-to-WhatsApp ads
- [!] Choose the AI model

## Built and tested locally (branches: backend, frontend; committed, not pushed)
- [x] Backend M1 to M10 code: tenancy, leads, intake, Telegram, Meta events, automation, AI layer, reports, privacy
- [x] Screens: Today, New leads, Pipeline board, All leads, Lead page, Reports, Automations, Meta results, Client setup, Privacy, New client, Client Portal, Login
- [x] Phones, light and dark mode, role access checked in a browser

## Needs your keys before it can be finished
- [ ] Run against real Supabase, Vercel, Meta and Telegram
- [ ] Real sign-in: tested only with the local sign-in so far
- [ ] Staff two-step login (MFA): not built, needs Supabase
- [ ] Invites: a person's email is stored and linked on first sign-in, but no invite email is sent yet
- [ ] Test supabase/cron.sql and pg-boss through the pooler
- [ ] Sentry, uptime check, backups and restore drill
- [ ] Pilot on 7Gence's own leads
