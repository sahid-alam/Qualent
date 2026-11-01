# Privacy operations

**Draft for counsel to review. Not legal advice.** The client is the data controller and 7Gence the processor.

## Sub-processors

| Who | What it holds | Where |
|---|---|---|
| Supabase | All CRM data and logins | Mumbai |
| Vercel | Passes through the app; no permanent storage of lead data | Mumbai |
| Meta | Leads it collected, and hashed email and phone in result events | Meta's own |
| Telegram | Lead name and masked phone in team alerts; name, phone and summary in private delivery | Telegram's own |
| Sentry | Error type, code location and cleaned message; no request or user data | Sentry's own; confirm region when the project is created |
| AI provider | Not chosen. Must be listed here, with its terms read, before any lead data reaches it | To be decided |

Moonshot (Kimi) isn't listed because it can only receive campaign numbers. The System page refuses to mark it no-training.

## What the product does

- **Consent:** each contact stores source, exact text and time.
- **Access and erasure:** a contact's page exports their data as JSON, or erases it. Reports keep anonymous counts.
- **Retention:** each client has a period in Client setup, enforced nightly.
- **Audit:** changes, exports and erasures are logged by column name, never by value. The app can't edit or delete the log.

## If there's a breach

1. **Contain.** Rotate whichever is affected: `app_user` password, `SECRET_KEY` (then reconnect each client), `CRON_SECRET`, webhook secrets, connection tokens.
2. **Scope.** Use `audit_log` and Supabase's logs to find which clients and contacts, and what period.
3. **Tell.** Tell each affected client straight away, because they're the controller and own any notice to regulators or people. Timelines come from counsel's opinion.
4. **Record.** Write down what happened, when it was found, what was done and what changes.
