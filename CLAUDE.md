# Qualent

Multi-tenant, white-label CRM that 7Gence runs for its Meta ads clients. It gets leads to people fast over Telegram, sends results back to Meta, and shows clients cost per qualified lead.

**Status: all of v1 that doesn't need keys is built and tested locally. Staff MFA, invite emails and password reset are not built. Nothing has run against real Supabase, Vercel, Meta or Telegram.** See `TASKS.md` and [docs/DEPLOY.md](docs/DEPLOY.md).

Read first: [docs/ROADMAP.md](docs/ROADMAP.md) for the next task, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design, [docs/adr/](docs/adr/) for why, [docs/flows.html](docs/flows.html) for the approved flows. Update `TASKS.md` as you go.

## Stack

Next.js 16, React 19, TypeScript, Tailwind 4, dnd-kit, zod, lucide-react, culori. Small own UI kit on the Ember tokens, Server Components and Server Actions (ADR-0011). Supabase Postgres and Auth, Drizzle ORM, pg-boss, libphonenumber-js, Sentry over its HTTP API (`lib/sentry.ts`; its SDK brings in a non-MIT CLI). Vercel Hobby in Mumbai (`bom1`), with no always-on worker: webhooks process right away with `after()`, and Supabase's scheduler calls `/api/cron/tick` when jobs are due. AI model not chosen yet.

## Folders

```
app/c/[tenantId]/   7Gence staff screens; actions.ts holds their server actions
app/portal/[tenantId]/  Client Portal, reports only, client-branded
app/ops/            System page, platform admins only
app/api/            Webhooks, intake and the scheduler tick
proxy.ts            Refreshes the Supabase session
worker/             Local job loop
lib/auth/           Session, guardPage(), action()
lib/settings.ts     People, rules, stages, branding, setup status
lib/queries.ts      Reads used only by screens
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
lib/system.ts       Health across clients, failed jobs, AI models
lib/sentry.ts       Error reports, with personal data scrubbed
components/         Shared UI
design/             theme.css, tokens.json
drizzle/            Migrations
supabase/cron.sql   Scheduler, run once per environment
tests/              Run as app_user on a real Postgres
```

## Commands

First run, with Postgres 17 on port 5432 (`brew services start postgresql@17`) and `.env.local` set from `.env.example`, with `DEV_AUTH=1`:

```bash
createdb qualent_dev
npm run db:migrate
psql qualent_dev -c "alter role app_user login password 'app_user'"
npm run db:seed      # sample data; local databases only
npm run dev          # then sign in as a sample person at /login
```

Day to day:

```bash
npm run dev          # web app
npm run worker       # runs queued jobs locally
npm test             # needs TEST_DATABASE_URL: a throwaway Postgres 17 database
npm run lint
npm run typecheck
npm run check:licenses
npm run check:css    # no physical CSS classes
npm run db:generate  # create a migration from lib/db/schema.ts
npm run db:migrate   # migrations, job queues, grants; needs MIGRATE_DATABASE_URL
npm run make-admin -- person@example.com   # first platform admin; see docs/DEPLOY.md
npm run telegram:setup                     # points the bot at APP_URL
```

Before calling a task done, run `npm run lint && npm run typecheck && npm test`, and meet its "Done when" in the roadmap.

The worker runs on Node's built-in TypeScript support with no build step, so `lib/` and `worker/` use relative imports with `.ts` extensions and no TypeScript-only runtime syntax such as enums.

## Coding rules

- **All data access goes through `withTenant()`**, including in the worker. Never connect with a role that bypasses row-level security.
- Every new tenant table has `tenant_id`, forced row-level security and composite foreign keys. The isolation test must pass.
- The browser never talks to the database.
- Webhooks verify signatures, save to `webhook_inbox`, queue a job, and reply. Process after the response with `after()`, never before it.
- A new tenant table gets its policy in a migration. `tests/isolation.test.ts` fails if row-level security is off on any public table.
- Errors from `withTenant()` and friends carry no query values: `error.cause` keeps the Postgres code and a message with quoted values masked.
- Jobs must be safe to run twice.
- Queue jobs in the same transaction as the data change.
- Validate input with zod at every boundary. Lead text is untrusted, including when passed to AI.
- Pages start with `guardPage(tenantId, permission)`. Server actions use `action(permission, schema, run)`, and anything touching one lead also calls `requireLeadAccess()`.
- Wall-clock times from forms mean the client's time zone. Convert with `localToUtc()`.
- Never nest forms: a `Dialog` holds its own form, so keep it outside other forms.
- Inside a scrolling box, add `relative`, or hidden `sr-only` labels make the page scroll sideways.
- All AI calls go through `aiRun()`. Lead data only reaches `no_training` models.
- Times are `timestamptz` in UTC, money is `numeric` plus currency, phones are E.164.
- Logs never contain phone numbers, emails or message text. A failed query's error message includes its values, so log and store errors through `safeMessage()`, and show people only `UserError` text.
- Anything exported to CSV goes through `safeCell()`, because lead text is untrusted and spreadsheets run formulas.
- Staff with `recordScope: "assigned"` see and change only their own leads. New reads and writes must respect this, not just tenant isolation.
- Before writing Next.js code, check the guide for this exact version in `node_modules/next/dist/docs/`. `next dev` creates `AGENTS.md` to say the same; keep it.
- Keep it simple: no abstraction until there is a second use. Non-trivial logic ships with one test.

## Design system

**Use the Mobbin MCP for any design or flow decision.** Look at how real products solve it before choosing, and name what you used in your summary.

Source of truth for look: `design/theme.css`, which follows www.7gence.com: near-black, white buttons, blue accent, Satoshi, small squared controls. **No orange anywhere.** [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) still holds the accessibility and layout rules, but its colors, radii and fonts describe the old Ember look, and `design/tokens.json` is unused. On scope (Arabic, WhatsApp, inbox, SVG logos) the PRD wins.

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
