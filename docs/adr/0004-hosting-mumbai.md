# ADR-0004: Host in Mumbai on Supabase and Vercel

Status: Accepted, 2026-11-01, by the owner ("for now Vercel"), after seeing the risks below.

**Context:** the first market is the UAE, and Supabase has no Middle East region. The app needs an always-on background worker. Railway has no India region, and Fly.io has deprecated Mumbai.

**Decision:** Supabase `ap-south-1` and Vercel `bom1`. The worker runs as a Vercel Daemon with one instance in `bom1`, on the Pro plan. Staging is a separate Vercel project, because Daemons only run in production.

**Consequences:**
- One platform and little setup, at about $8.50 a month in worker memory plus active CPU.
- Lead alerts depend on a public beta. Jobs wait safely in Postgres during an outage, and a heartbeat alert fires.
- Personal data sits in India. Counsel must cover PDPL transfers and India's DPDP Act.
- Backups go to a second Indian city, because March 2026 showed one region is not enough.

**Fallback:** the worker is a plain Docker image, so it can move to Google Cloud Run `asia-south1` without code changes, and the app can follow if needed. Move if Daemons fail in `bom1`, leave beta on bad terms, or cause missed alerts.

**To record in M1:** whether the daemon runs in `bom1`, and the measured database round trip.
