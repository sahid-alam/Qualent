-- Run once in the Supabase SQL editor after deploying. Replace APP_URL and
-- CRON_SECRET first, and keep the filled-in copy out of the repo.
--
-- Why this exists: Vercel's free plan only allows daily cron jobs, and its
-- worker quota would run out mid-month. So Postgres wakes the app, and only
-- when a job is due, which keeps Vercel usage inside the free limits.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function ops.wake_app() returns void language sql as $$
  select net.http_post(
    url := 'APP_URL/api/cron/tick',
    headers := '{"authorization": "Bearer CRON_SECRET", "content-type": "application/json"}'::jsonb,
    timeout_milliseconds := 55000
  );
$$;

-- Every minute, only if a job is due.
select cron.schedule('qualent-due-jobs', '* * * * *', $$
  select ops.wake_app() where exists (
    select 1 from pgboss.job
    where state in ('created', 'retry') and start_after <= now()
    limit 1
  );
$$);

-- Every 15 minutes regardless: heartbeat, Meta safety poll, automation sweep.
select cron.schedule('qualent-heartbeat', '*/15 * * * *', 'select ops.wake_app()');
