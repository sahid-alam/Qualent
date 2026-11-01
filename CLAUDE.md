# Qualent

Multi-tenant, white-label CRM that 7Gence runs for its Meta ads clients. It gets leads to people fast over Telegram, sends results back to Meta, and shows clients cost per qualified lead.

**Status: plan approved 2026-11-01; building from milestone M1.**

Read first: [docs/ROADMAP.md](docs/ROADMAP.md) for the next task, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design, [docs/adr/](docs/adr/) for why. Update `TASKS.md` as you go.

## Stack

Next.js 16, React 19, TypeScript, Tailwind 4, shadcn/ui, TanStack Table and Query, dnd-kit, react-hook-form, zod, Recharts, lucide-react. Supabase Postgres and Auth, Drizzle ORM, pg-boss, libphonenumber-js, Sentry. Vercel Hobby in Mumbai (`bom1`), with no always-on worker: webhooks process right away with `after()`, and Supabase's scheduler calls `/api/cron/tick` when jobs are due. AI model not chosen yet.

## Folders

```
app/(workspace)/    7Gence staff screens
app/(portal)/       Client Portal, reports only
app/api/            Webhooks and intake routes
worker/             Local job loop
lib/db/             Drizzle schema, withTenant()
lib/jobs/           Queues, drain(), tick(), job handlers
lib/leads/          ingestLead(), moveStage(), lead work
lib/intake/         Meta and landing page intake
lib/capi/           Meta event sender
lib/telegram/       Bot, alerts, delivery, buttons
lib/ai/             aiRun(), redaction, tasks
lib/routing.ts      Assignment and reply timers
lib/automation.ts   Rules
lib/reports.ts      Spend sync, client and team reports
lib/privacy.ts      Export, erase, retention
components/         Shared UI
design/             theme.css, tokens.json
drizzle/            Migrations
supabase/cron.sql   Scheduler, run once per environment
tests/              Run as app_user on a real Postgres
```

## Commands

```bash
npm run dev          # web app
npm run worker       # background worker
npm test             # needs TEST_DATABASE_URL: a throwaway Postgres 17 database
npm run lint
npm run typecheck
npm run check:licenses
npm run check:css    # no physical CSS classes
npm run db:generate  # create a migration from lib/db/schema.ts
npm run db:migrate   # migrations, job queues, grants; needs MIGRATE_DATABASE_URL
```

Before calling a task done, run `npm run lint && npm run typecheck && npm test`, and meet its "Done when" in the roadmap.

The worker runs on Node's built-in TypeScript support with no build step, so `lib/` and `worker/` use relative imports with `.ts` extensions and no TypeScript-only runtime syntax such as enums.

## Coding rules

- **All data access goes through `withTenant()`**, including in the worker. Never connect with a role that bypasses row-level security.
- Every new tenant table has `tenant_id`, forced row-level security and composite foreign keys. The isolation test must pass.
- The browser never talks to the database.
- Webhooks verify signatures, save to `webhook_inbox`, queue a job, and reply. Process after the response with `after()`, never before it.
- A new tenant table gets its policy in a migration. `tests/isolation.test.ts` fails if row-level security is off on any public table.
- Drizzle wraps database errors, so read `error.cause` for the real message.
- Jobs must be safe to run twice.
- Queue jobs in the same transaction as the data change.
- Validate input with zod at every boundary. Lead text is untrusted, including when passed to AI.
- All AI calls go through `aiRun()`. Lead data only reaches `no_training` models.
- Times are `timestamptz` in UTC, money is `numeric` plus currency, phones are E.164.
- Logs never contain phone numbers, emails or message text.
- Before writing Next.js code, check the guide for this exact version in `node_modules/next/dist/docs/`. `next dev` creates `AGENTS.md` to say the same; keep it.
- Keep it simple: no abstraction until there is a second use. Non-trivial logic ships with one test.

## Design system

**Use the Mobbin MCP for any design or flow decision.** Look at how real products solve it before choosing, and name what you used in your summary.

Source of truth for look and accessibility: [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) and `design/theme.css`. It was written before scope was final, so on scope (Arabic, WhatsApp, inbox, SVG logos) the PRD wins.

- Use semantic tokens (`bg-panel`, `text-fg-muted`, `border-line`). No raw colors and no inline styles.
- Logical CSS only (`ms-`, `pe-`, `text-start`). Physical classes such as `ml-` or `text-left` fail lint.
- Never put text on raw `bg-brand`. Use `bg-(image:--gradient-accent) text-on-accent`.
- Lead temperature colors never change with a client's brand.
- Use real `<table>`, native `<dialog>` and native `<select>` where they fit. Never remove focus outlines.
- Text in rem, with touch targets of at least 44px on touch devices. Every drag has a keyboard alternative.
- Client branding changes only color, logo and name. Logos are PNG or WebP in v1.

## Do not

- **Do not modify the reference project** at `/Users/sahidalam/Developer/7gence_client/roi-maxi-master-inbox`. It is read-only. Reusing its design is fine: it is the owner's own.
- Do not fork a CRM, or copy code from AGPL, GPL or "Enterprise"-licensed files. Only MIT or Apache, with notices kept.
- Do not send any message to a lead from the CRM, or let AI send anything by itself.
- Do not add WhatsApp, Redis, a workflow engine or microservices in v1.
- Do not send lead data to Kimi or to any model marked `no_training = false`.
- Do not send a Meta test event code from production, or events older than 7 days.
- Do not commit secrets, or put real lead data in tests or fixtures.
