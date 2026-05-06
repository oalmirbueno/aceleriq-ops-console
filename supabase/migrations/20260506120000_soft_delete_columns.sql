-- Soft delete + sync_status columns for portal→ops delete propagation.
alter table public.clients add column if not exists deleted_at timestamptz;
alter table public.clients add column if not exists sync_status text;
alter table public.workspaces add column if not exists deleted_at timestamptz;
alter table public.workspaces add column if not exists sync_status text;
alter table public.canvas_nodes add column if not exists deleted_at timestamptz;
alter table public.canvas_nodes add column if not exists archived_at timestamptz;
alter table public.canvas_nodes add column if not exists sync_status text;

create index if not exists clients_deleted_at_idx on public.clients (deleted_at) where deleted_at is not null;
create index if not exists workspaces_deleted_at_idx on public.workspaces (deleted_at) where deleted_at is not null;
create index if not exists canvas_nodes_deleted_at_idx on public.canvas_nodes (deleted_at) where deleted_at is not null;
