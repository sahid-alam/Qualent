do $$ begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end $$;
--> statement-breakpoint
grant usage on schema public, ops to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
grant select, insert, update on ops.worker_heartbeat to app_user;
revoke update, delete on audit_log from app_user;
--> statement-breakpoint
-- Close Supabase's auto-generated API. These roles only exist on Supabase.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
    end if;
  end loop;
end $$;
--> statement-breakpoint
-- Every public table: RLS on, forced even for the owner.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
  for t in
    select c.table_name from information_schema.columns c
    join pg_tables p on p.tablename = c.table_name and p.schemaname = c.table_schema
    where c.table_schema = 'public' and c.column_name = 'tenant_id'
      and c.table_name not in ('members', 'tenant_directory')
  loop
    execute format(
      'create policy tenant_isolation on %I to app_user
         using (tenant_id = current_setting(''app.tenant_id'')::uuid)
         with check (tenant_id = current_setting(''app.tenant_id'')::uuid)', t);
  end loop;
end $$;
--> statement-breakpoint
create policy tenant_access on tenants to app_user
  using (id = nullif(current_setting('app.tenant_id', true), '')::uuid or current_setting('app.platform', true) = 'on')
  with check (id = nullif(current_setting('app.tenant_id', true), '')::uuid or current_setting('app.platform', true) = 'on');
--> statement-breakpoint
-- Softer settings lookups here, because a caller in user mode has no tenant set.
create policy tenant_isolation on members to app_user
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
create policy own_memberships on members for select to app_user
  using (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
create policy directory_read on tenant_directory for select to app_user using (true);
create policy directory_write on tenant_directory for insert to app_user
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
create policy directory_delete on tenant_directory for delete to app_user
  using (kind = 'link_code' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
create policy app_access on profiles to app_user using (true) with check (true);
create policy app_access on webhook_inbox to app_user using (true) with check (true);
create policy app_access on ai_models to app_user using (true) with check (true);
--> statement-breakpoint
create function audit_row() returns trigger language plpgsql as $$
declare
  rec jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  changed jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_agg(n.key) into changed
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'updated_at';
    if changed is null then return new; end if;
  end if;
  insert into audit_log (tenant_id, actor, action, table_name, row_id, changed_columns)
  values (
    coalesce(rec->>'tenant_id', rec->>'id')::uuid,
    coalesce(nullif(current_setting('app.actor', true), ''), 'unknown'),
    lower(tg_op), tg_table_name, rec->>'id', changed
  );
  return null;
end $$;
--> statement-breakpoint
do $$
declare t text;
begin
  foreach t in array array['members', 'contacts', 'leads', 'stages', 'pipelines', 'routing_rules', 'automation_rules', 'connections', 'custom_field_defs'] loop
    execute format('create trigger audit after insert or update or delete on %I for each row execute function audit_row()', t);
  end loop;
end $$;
