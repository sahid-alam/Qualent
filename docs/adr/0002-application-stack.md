# ADR-0002: Next.js 16, Supabase and Drizzle

Status: Accepted, 2026-11-01.

**Context:** the reference project uses Next.js 15.5 and Supabase, and the team knows them. Next 16 is now `latest`, and 15 is on a backport tag.

**Decision:** Next.js 16, React 19, TypeScript, Tailwind 4. Supabase for Postgres and Auth. Drizzle ORM from the server only.

**Consequences:** real transactions and one server-side path to data. The browser never talks to the database, and Supabase's auto-generated API is off for app tables. Some reference patterns may need updating for Next 16. The reference is the owner's own unreleased design, so it can be reused freely.
