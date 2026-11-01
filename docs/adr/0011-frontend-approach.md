# ADR-0011: Server-rendered screens with a small own UI kit

Status: Accepted, 2026-11-01.

**Context:** the plan listed shadcn/ui, TanStack Table and Query, react-hook-form and Recharts. The approved flows are mostly lists and short forms, and the design system already asks for native `<dialog>`, `<select>` and `<table>`.

**Decision:**
- Server Components for reads and Server Actions for writes. Filters live in the URL.
- `components/ui.tsx` and `components/forms.tsx` hold a small UI kit built on the Ember tokens.
- Add a library only where the browser can't do the job: dnd-kit for the board, culori for brand colors.
- `lib/auth/action.ts` wraps every action with validation, the session check and the permission check.

**Consequences:** fewer dependencies and far less browser JavaScript. Long tables reload on each filter instead of filtering instantly. Add TanStack Table if a screen needs column reordering or virtual scrolling, and a chart library when reports need charts.

**Applied defaults from the flows review:** setup warns and never blocks; staff land on Today; qualifying offers delivery and can be skipped; Telegram buttons default to Contacted, Viewing, Won, Lost; only managers can erase; Meta results are staff-only; clients see the labeled "Manual entries" row. Sessions lasting 30 days still need setting in Supabase.
