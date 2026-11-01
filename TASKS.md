# Qualent — Task List

Legend: [x] done · [~] in progress · [ ] not started · [!] waiting on you

## Planning (done)
- [x] Research, feature list and your answers
- [x] docs/ARCHITECTURE.md, docs/PRD.md, docs/ROADMAP.md, docs/adr/, CLAUDE.md
- [x] Your decisions: Telegram buttons, Mumbai on Vercel, Gemma through Ollama, no WhatsApp in v1, name Qualent
- [x] Plan approved 2026-11-01
- [x] ROI-Maxi design cleared for reuse: it is your own

## Your side (ROADMAP M0)
- [!] Meta Business Verification
- [!] UAE counsel: PDPL, hosting in India, and lead data reaching Ollama Cloud
- [!] Trademark and domain check for "Qualent" (qualent.com is taken)
- [!] Accounts: Vercel Pro, Supabase, Ollama, Kimi, Sentry
- [!] Check how much client spend runs on Click-to-WhatsApp ads

## M1: Foundation
- [x] 1.1 Git repo, Next.js 16, TypeScript, Tailwind 4, theme (nothing committed yet)
- [~] 1.2 CI file written and all checks pass locally; not yet run on GitHub  (needs a GitHub repo)
- [~] 1.3 Migration works on local Postgres  (needs your Supabase account)
- [~] 1.4 vercel.json and worker image ready; image tested in Docker  (needs your Vercel account)
- [ ] 1.5 Confirm Daemons run in Mumbai  (needs 1.4)
- [x] 1.6 pg-boss delayed job survives a worker crash, tested on local Postgres
- [ ] 1.7 Measure the database round trip; test poolers  (needs 1.3, 1.4)
- [ ] 1.8 Sentry and uptime check  (needs your Sentry account)
- [x] 1.9 Worker heartbeat and /api/health, tested on local Postgres

## M2 to M10
- [ ] Per docs/ROADMAP.md
