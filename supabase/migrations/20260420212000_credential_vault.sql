-- Credential Vault — promove credential_vault.sql do repositório a migration formal.
create extension if not exists pgcrypto;

do $$ begin
  create type public.credential_category as enum (
    'platform','hosting_dns','cms','social_email','other'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.client_credentials (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  node_id         uuid references public.canvas_nodes(id) on delete set null,
  category        public.credential_category not null default 'platform',
  service_name    text not null,
  label           text,
  login_url       text,
  username        text,
  notes           text,
  metadata        jsonb default '{}'::jsonb,
  secret_cipher   bytea,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_revealed_at  timestamptz,
  last_revealed_by  uuid references auth.users(id) on delete set null
);

create index if not exists idx_client_credentials_client    on public.client_credentials(client_id);
create index if not exists idx_client_credentials_workspace on public.client_credentials(workspace_id);
create index if not exists idx_client_credentials_node      on public.client_credentials(node_id);

create table if not exists public.credential_audit_log (
  id            uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.client_credentials(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  action        text not null check (action in ('reveal','create','update','delete')),
  revealed_at   timestamptz not null default now()
);
create index if not exists idx_credential_audit_cred on public.credential_audit_log(credential_id, revealed_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_client_credentials_updated on public.client_credentials;
create trigger trg_client_credentials_updated
  before update on public.client_credentials
  for each row execute function public.set_updated_at();

alter table public.client_credentials  enable row level security;
alter table public.credential_audit_log enable row level security;

create or replace function public.user_in_workspace(_workspace uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = _workspace and user_id = _user
  )
  or exists (
    select 1 from public.workspaces
    where id = _workspace and primary_owner_id = _user
  );
$$;

drop policy if exists "Members can read credential metadata" on public.client_credentials;
create policy "Members can read credential metadata"
  on public.client_credentials for select
  to authenticated
  using (public.user_in_workspace(workspace_id, auth.uid()));

drop policy if exists "Members can manage credentials" on public.client_credentials;
create policy "Members can manage credentials"
  on public.client_credentials for all
  to authenticated
  using (public.user_in_workspace(workspace_id, auth.uid()))
  with check (public.user_in_workspace(workspace_id, auth.uid()));

drop policy if exists "Members can read audit log" on public.credential_audit_log;
create policy "Members can read audit log"
  on public.credential_audit_log for select
  to authenticated
  using (public.user_in_workspace(workspace_id, auth.uid()));

drop policy if exists "Service can write audit log" on public.credential_audit_log;
create policy "Service can write audit log"
  on public.credential_audit_log for insert
  to service_role
  with check (true);

create or replace function public.vault_encrypt(plain text, key text)
returns bytea language sql security definer set search_path = public, extensions as $$
  select pgp_sym_encrypt(plain, key);
$$;

create or replace function public.vault_decrypt(cipher bytea, key text)
returns text language sql security definer set search_path = public, extensions as $$
  select pgp_sym_decrypt(cipher, key);
$$;

revoke execute on function public.vault_encrypt(text, text) from public, anon, authenticated;
revoke execute on function public.vault_decrypt(bytea, text) from public, anon, authenticated;
grant execute on function public.vault_encrypt(text, text) to service_role;
grant execute on function public.vault_decrypt(bytea, text) to service_role;
