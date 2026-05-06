-- Aceleriq OPS ↔ Portal — colunas estáveis de vínculo + telemetria de sync.
-- Idempotente: pode rodar quantas vezes quiser no Supabase externo do OPS.
-- Como rodar:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Cole este arquivo inteiro → Run

-- clients ─────────────────────────────────────────────
alter table public.clients add column if not exists portal_client_id text;
alter table public.clients add column if not exists last_synced_at timestamptz;
alter table public.clients add column if not exists sync_status text;
alter table public.clients add column if not exists sync_error text;
create unique index if not exists clients_portal_client_id_key
  on public.clients (portal_client_id) where portal_client_id is not null;

-- workspaces (= projects no Portal) ───────────────────
alter table public.workspaces add column if not exists portal_project_id text;
alter table public.workspaces add column if not exists last_synced_at timestamptz;
alter table public.workspaces add column if not exists sync_status text;
alter table public.workspaces add column if not exists sync_error text;
create unique index if not exists workspaces_portal_project_id_key
  on public.workspaces (portal_project_id) where portal_project_id is not null;

-- canvas_nodes (= tasks/milestones no Portal) ─────────
alter table public.canvas_nodes add column if not exists portal_task_id text;
alter table public.canvas_nodes add column if not exists portal_milestone_id text;
alter table public.canvas_nodes add column if not exists portal_project_id text;
alter table public.canvas_nodes add column if not exists last_synced_at timestamptz;
alter table public.canvas_nodes add column if not exists sync_status text;
alter table public.canvas_nodes add column if not exists sync_error text;
create unique index if not exists canvas_nodes_portal_task_id_key
  on public.canvas_nodes (portal_task_id) where portal_task_id is not null;
create index if not exists canvas_nodes_portal_project_id_idx
  on public.canvas_nodes (portal_project_id) where portal_project_id is not null;
create index if not exists canvas_nodes_portal_milestone_id_idx
  on public.canvas_nodes (portal_milestone_id) where portal_milestone_id is not null;
