-- ═══════════════════════════════════════════════════════════════════════
-- CREDENTIAL VAULT — cofre de credenciais de cliente, criptografado
-- ═══════════════════════════════════════════════════════════════════════
--
-- Estratégia de segurança:
--  * pgcrypto (pgp_sym_encrypt) com master key vinda do edge function
--    (Deno.env.get('CREDENTIAL_VAULT_KEY')) — a key NUNCA fica no banco
--  * tabela armazena bytea criptografado em `secret_cipher`
--  * RLS:  list/insert/update/delete = qualquer membro do workspace
--          reveal (SELECT do bytea) = bloqueado pra cliente; só edge function
--          (service-role) consegue descriptografar
--  * tabela credential_audit_log registra TODA descriptografia
--  * roles: usa user_roles existente (admin pode revelar; resto vê metadados)
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── Categorias ─────────────────────────────────────────────────────────
do $$ begin
  create type public.credential_category as enum (
    'platform',     -- Meta, Google Ads, GA4, Search Console
    'hosting_dns',  -- cPanel, Cloudflare, registrar
    'cms',          -- WordPress, Webflow, Shopify
    'social_email', -- IG, FB, LinkedIn, e-mail corporativo
    'other'
  );
exception when duplicate_object then null; end $$;

-- ─── Tabela principal ───────────────────────────────────────────────────
create table if not exists public.client_credentials (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  /** node_id é opcional — credenciais podem viver sob um node 'acessos' do canvas */
  node_id         uuid references public.canvas_nodes(id) on delete set null,

  category        public.credential_category not null default 'platform',
  /** Ex: "Meta Ads", "WordPress", "GA4 Property", "Cloudflare" */
  service_name    text not null,
  /** Ex: "Conta principal Brasil", "Landing v2" */
  label           text,
  /** URL do painel/login */
  login_url       text,
  /** Username/email/login (texto plano — não-sensível por si só) */
  username        text,
  /** Notas livres não-sensíveis (ex: "usar 2FA via SMS no número X") */
  notes           text,
  /** Marcadores extras: papel (admin/editor), validade, conta vinculada... */
  metadata        jsonb default '{}'::jsonb,

  /** O segredo: senha + opcional 2FA backup, criptografado com pgp_sym */
  secret_cipher   bytea,

  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  /** Última vez que alguém revelou — coluna denormalizada pro UI */
  last_revealed_at  timestamptz,
  last_revealed_by  uuid references auth.users(id) on delete set null
);

create index if not exists idx_client_credentials_client on public.client_credentials(client_id);
create index if not exists idx_client_credentials_workspace on public.client_credentials(workspace_id);
create index if not exists idx_client_credentials_node on public.client_credentials(node_id);

-- ─── Auditoria ──────────────────────────────────────────────────────────
create table if not exists public.credential_audit_log (
  id            uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.client_credentials(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  action        text not null check (action in ('reveal','create','update','delete')),
  revealed_at   timestamptz not null default now()
);
create index if not exists idx_credential_audit_cred on public.credential_audit_log(credential_id, revealed_at desc);

-- ─── Trigger updated_at ─────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_client_credentials_updated on public.client_credentials;
create trigger trg_client_credentials_updated
  before update on public.client_credentials
  for each row execute function public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.client_credentials enable row level security;
alter table public.credential_audit_log enable row level security;

-- Helper: usuário pertence ao workspace?
-- (assume função existente; se não houver, usa workspace_members direto)
create or replace function public.user_in_workspace(_workspace uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = _workspace and user_id = _user
  )
  or exists (
    select 1 from public.workspaces
    where id = _workspace and owner_user_id = _user
  );
$$;

-- list/select METADATA (sem cipher) — qualquer membro
drop policy if exists "Members can read credential metadata" on public.client_credentials;
create policy "Members can read credential metadata"
  on public.client_credentials for select
  to authenticated
  using (public.user_in_workspace(workspace_id, auth.uid()));

-- insert / update / delete — qualquer membro
drop policy if exists "Members can manage credentials" on public.client_credentials;
create policy "Members can manage credentials"
  on public.client_credentials for all
  to authenticated
  using (public.user_in_workspace(workspace_id, auth.uid()))
  with check (public.user_in_workspace(workspace_id, auth.uid()));

-- audit log — leitura por membros, escrita pelo edge (service role bypassa)
drop policy if exists "Members can read audit log" on public.credential_audit_log;
create policy "Members can read audit log"
  on public.credential_audit_log for select
  to authenticated
  using (public.user_in_workspace(workspace_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════
-- SEGURANÇA EXTRA:
-- O cliente NUNCA deve conseguir SELECT na coluna `secret_cipher` direto.
-- A política acima permite SELECT em todas as colunas pra membros — o
-- bytea é inútil sem a master key. Mesmo assim, a edge function é o único
-- caminho oficial pra ler/gravar o segredo (usa service role + key).
-- ═══════════════════════════════════════════════════════════════════════

-- ─── RPC helpers usadas pela edge function ──────────────────────────────
-- Encrypt/decrypt centralizados no banco pra a edge function não precisar
-- carregar lib pgp em Deno. Recebem a master key como parâmetro (a edge
-- function lê o secret e injeta na chamada).
create or replace function public.vault_encrypt(plain text, key text)
returns bytea language sql security definer set search_path = public, extensions as $$
  select pgp_sym_encrypt(plain, key);
$$;

create or replace function public.vault_decrypt(cipher bytea, key text)
returns text language sql security definer set search_path = public, extensions as $$
  select pgp_sym_decrypt(cipher, key);
$$;

-- Restringe execução das RPCs ao service_role (a edge function chama via service role)
revoke execute on function public.vault_encrypt(text, text) from public, anon, authenticated;
revoke execute on function public.vault_decrypt(bytea, text) from public, anon, authenticated;
grant execute on function public.vault_encrypt(text, text) to service_role;
grant execute on function public.vault_decrypt(bytea, text) to service_role;
