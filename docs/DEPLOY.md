# Going live

Do these in order, once for staging and once for production. Keep every key in a password manager, never in chat or the repo. Local setup is in `CLAUDE.md`.

`/ops` (the System page, platform admins only) shows which settings exist and whether the scheduler is running. Use it to check your work.

## 1. Supabase

1. Create a project in Mumbai (`ap-south-1`).
2. Under Data API settings, turn off the Data API, or leave `public` unexposed. The browser never talks to the database.
3. Run the migrations with the direct connection string, as `postgres`:
   ```bash
   MIGRATE_DATABASE_URL=<direct connection> npm run db:migrate
   ```
4. Give the app its own role, with a long random password:
   ```sql
   alter role app_user login password '<password>';
   ```
5. Note these for Vercel:
   - `DATABASE_URL`: the **transaction pooler** string (port 6543), with `app_user` as the user.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

**First thing to test:** pg-boss and `SET LOCAL` through the transaction pooler have never run on real Supabase. If pg-boss fails there, use the session pooler (port 5432) for `DATABASE_URL`, and record the result in ADR-0004.

## 2. Vercel

Create the project, confirm the region is `bom1` (`vercel.json` sets it), and add:

| Variable | Value |
|---|---|
| `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | From step 1 |
| `APP_URL` | The deployment's address, with no trailing slash |
| `SECRET_KEY` | `openssl rand -base64 32`. Encrypts connection tokens. Losing it means reconnecting every client |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `META_APP_SECRET`, `META_VERIFY_TOKEN` | Step 5. Make up the verify token |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Step 4 |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `OPS_TELEGRAM_CHAT_ID` | Step 4 |
| `SENTRY_DSN` | Step 6 |

Do not set `DEV_AUTH`. It is ignored in production, but it doesn't belong there. Vercel's free plan is non-commercial, so move to Pro before the first paying client.

## 3. Scheduler and first admin

1. Copy `supabase/cron.sql`, replace `APP_URL` and `CRON_SECRET`, and run it in the Supabase SQL editor. Don't commit the filled-in copy.
2. Add yourself under Authentication in Supabase, with a password.
3. Make yourself the first admin:
   ```bash
   MIGRATE_DATABASE_URL=<direct connection> DATABASE_URL=<app_user connection> npm run make-admin -- you@example.com
   ```
4. Sign in. With no clients yet, you land on New client.
5. Open `/ops`. Within 15 minutes the scheduler should show Running.

## 4. Telegram

1. Create a bot with @BotFather. Leave privacy mode on.
2. With the bot's settings in your environment, point it at the deployment:
   ```bash
   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... APP_URL=... npm run telegram:setup
   ```
3. For ops alerts, add the bot to a private 7Gence group and put that group's chat ID in `OPS_TELEGRAM_CHAT_ID`.
4. Per client, Client setup creates the team group link and each agent's private link.

## 5. Meta

1. In the Meta app, add the Webhooks product for **Page**, with callback `APP_URL/api/webhooks/meta` and your `META_VERIFY_TOKEN`. Subscribe to `leadgen`.
2. Complete Business Verification and App Review for `leads_retrieval`, `pages_manage_metadata`, `pages_show_list` and `ads_read`. This can take weeks. **[UNVERIFIED: confirm the exact permission list in the app dashboard.]**
3. Per client, Client setup takes the page, dataset and ad account. Saving a page subscribes it to the webhook and reports a bad token straight away.
4. Send a test lead with Meta's Lead Ads Testing Tool, and use "Send a test event" on Meta results. **Staging only:** production refuses test codes.

## 6. Monitoring

- **Sentry:** create a Node project and set `SENTRY_DSN`. Force one error on staging, and check it arrives with no personal data.
- **Uptime:** point an external check at `APP_URL/api/health`. It fails when ticks stop for 20 minutes.

## 7. Backups

The free Supabase plan has no point-in-time recovery, so run this nightly from somewhere outside Supabase, into separate storage under its own account:

```bash
pg_dump "<direct connection>" --format=custom | gpg --symmetric --batch --passphrase-file <file> > qualent-$(date +%F).dump.gpg
```

Restore into staging every quarter, and record the time against the 4-hour target. A backup that has never been restored doesn't count.

## Before the first client

- Pilot on 7Gence's own leads for two weeks, and report the PRD section 4 measures.
- Counsel's opinion on PDPL and hosting in India, and the data processing agreement. See [PRIVACY.md](PRIVACY.md).
- Vercel Pro.

## Not built yet

These need a real Supabase project to build and test:

- **Staff MFA (FR-3).** Until then, staff sign in with a password only. Don't put real client leads in before it's done.
- **Invite emails and password reset.** Until then, add each person in Supabase with a password, using the same email as in Client setup. They're linked on first sign-in.
