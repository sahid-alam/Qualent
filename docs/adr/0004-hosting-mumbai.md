# ADR-0004: Mumbai on Vercel's free plan and Supabase, for v1

Status: Accepted, 2026-11-01, by the owner ("for v1 we will go with free Vercel").

**Context:** the first market is the UAE, and Supabase has no Middle East region. Railway has no India region, and Fly.io has deprecated Mumbai.

**Decision:** Supabase `ap-south-1` and Vercel Hobby in `bom1`. No always-on worker: see ADR-0005.

**Why no Vercel Daemon on Hobby:** its quota is 420 GB-hours a month, so even a 1 GB worker stops after about 17 days, and all daemons stay stopped until the next month.

**Free plan limits [Official]:**
- **Non-commercial only.** Vercel's terms restrict Hobby to personal, non-commercial use. Move to Pro ($20 a seat a month) before the first paying client, or accept the risk that the account is paused.
- 4 hours of Active CPU, 360 GB-hours of memory, 1 million invocations a month. Going over means waiting up to 30 days. There is no paying to continue on Hobby, so watch usage.
- Runtime logs last 1 hour.

**Supabase free plan:** 500 MB per project, and projects pause after 7 days of low activity [Official]. Whether scheduled jobs count as activity is unconfirmed. Mumbai on the free plan and free-plan backups are also unconfirmed, so check them when creating the project.

**Consequences:**
- Personal data sits in India. Counsel must cover PDPL transfers and India's DPDP Act.
- There is no point-in-time recovery on free plans, so the backup targets in ARCHITECTURE.md section 13 need a paid plan or an external nightly dump.

**Move when:** the first client pays, usage nears a limit, or a limit is hit. The worker has a Dockerfile, so it can run on Daemons or Cloud Run without code changes.
