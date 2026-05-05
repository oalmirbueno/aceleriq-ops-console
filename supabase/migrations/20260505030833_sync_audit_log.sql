-- Auditable log of every bidirectional sync event between Portal and Ops.
create table if not exists public.sync_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  direction text not null,
  event text not null,
  status text not null,
  workspace_id uuid,
  client_id uuid,
  node_id uuid,
  portal_project_id text,
  portal_task_id text,
  portal_milestone_id text,
  http_status int,
  message text,
  payload jsonb,
  response jsonb,
  duration_ms int,
  source text
);

create index if not exists sync_audit_log_created_at_idx on public.sync_audit_log (created_at desc);
create index if not exists sync_audit_log_workspace_idx on public.sync_audit_log (workspace_id, created_at desc);
create index if not exists sync_audit_log_event_idx on public.sync_audit_log (event, status, created_at desc);
create index if not exists sync_audit_log_portal_task_idx on public.sync_audit_log (portal_task_id) where portal_task_id is not null;

alter table public.sync_audit_log enable row level security;

drop policy if exists "sync_audit_log: service role full access" on public.sync_audit_log;
create policy "sync_audit_log: service role full access"
  on public.sync_audit_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Reads via service role only (no roles system yet).

create or replace function public.sync_audit_log_prune()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if random() < 0.01 then
    delete from public.sync_audit_log where created_at < now() - interval '30 days';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_audit_log_prune_tg on public.sync_audit_log;
create trigger sync_audit_log_prune_tg
after insert on public.sync_audit_log
for each row execute function public.sync_audit_log_prune();
