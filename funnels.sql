-- ═══════════════════════════════════════════════════════════════════════
-- FUNNELS — editor visual de funis por cliente
-- ═══════════════════════════════════════════════════════════════════════
--
-- Modelo:
--   client_funnels         → 1 funil = 1 node "funil" do canvas (1:1 via node_id)
--   funnel_steps           → etapas do pipeline linear (ordenadas por position)
--   funnel_branches        → ramificações condicionais entre etapas
--                            (ex: step A "comprou" → step B; A "não comprou" → step C)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Enums ──────────────────────────────────────────────────────────────
do $$ begin
  create type public.funnel_block_kind as enum (
    -- tráfego
    'traffic_ad','traffic_organic','traffic_email_cold','traffic_partner',
    -- páginas
    'page_landing','page_vsl','page_thanks','page_checkout','page_upsell','page_downsell',
    -- comunicação
    'comm_email_sequence','comm_whatsapp','comm_sms','comm_push',
    -- lógica
    'logic_decision','logic_split_test','logic_tag','logic_delay'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.funnel_branch_condition as enum ('yes','no','variant_a','variant_b','default');
exception when duplicate_object then null; end $$;

-- ─── client_funnels ─────────────────────────────────────────────────────
create table if not exists public.client_funnels (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  /** node_id do canvas (kind=funil). 1 funil ↔ 1 node */
  node_id       uuid unique references public.canvas_nodes(id) on delete cascade,

  name          text not null default 'Funil sem nome',
  goal          text,
  /** Ex: "lead-magnet", "lançamento", "perpetuo", "evergreen-vsl" */
  funnel_type   text,
  /** Métricas globais: target_conversion, baseline, roas alvo, etc. */
  metrics       jsonb not null default '{}'::jsonb,
  notes         text,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_client_funnels_client    on public.client_funnels(client_id);
create index if not exists idx_client_funnels_workspace on public.client_funnels(workspace_id);
create index if not exists idx_client_funnels_node      on public.client_funnels(node_id);

-- ─── funnel_steps ──────────────────────────────────────────────────────
create table if not exists public.funnel_steps (
  id              uuid primary key default gen_random_uuid(),
  funnel_id       uuid not null references public.client_funnels(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,

  /** Posição no pipeline linear (0,1,2,...). Ramificações têm position null. */
  position        integer,
  block_kind      public.funnel_block_kind not null,
  title           text not null,
  description     text,

  /** Vínculo opcional com outro node do canvas (asset, landing, conteúdo) */
  linked_node_id  uuid references public.canvas_nodes(id) on delete set null,

  /** Conversão esperada/realizada da entrada → saída desta etapa (0..1) */
  conversion_rate numeric(5,4),
  /** Volume de entrada esperado/realizado nesta etapa */
  expected_volume integer,
  actual_volume   integer,

  /** Checklist de produção do bloco: [{id,text,done}] */
  checklist       jsonb not null default '[]'::jsonb,
  /** Métricas específicas do bloco (CTR, CPL, CPA, open rate, ...) */
  metrics         jsonb not null default '{}'::jsonb,
  /** Config livre por kind (ex: page_landing → url; comm_email_sequence → email_count) */
  config          jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_funnel_steps_funnel   on public.funnel_steps(funnel_id, position);
create index if not exists idx_funnel_steps_linked   on public.funnel_steps(linked_node_id);

-- ─── funnel_branches ───────────────────────────────────────────────────
-- Saída de uma etapa de lógica (logic_decision/logic_split_test) que
-- direciona pra outra etapa baseado em condição.
create table if not exists public.funnel_branches (
  id            uuid primary key default gen_random_uuid(),
  funnel_id     uuid not null references public.client_funnels(id) on delete cascade,
  from_step_id  uuid not null references public.funnel_steps(id) on delete cascade,
  to_step_id    uuid not null references public.funnel_steps(id) on delete cascade,
  condition     public.funnel_branch_condition not null default 'default',
  label         text,
  created_at    timestamptz not null default now(),
  unique (from_step_id, condition)
);

create index if not exists idx_funnel_branches_funnel on public.funnel_branches(funnel_id);

-- ─── updated_at trigger ────────────────────────────────────────────────
drop trigger if exists trg_client_funnels_updated on public.client_funnels;
create trigger trg_client_funnels_updated
  before update on public.client_funnels
  for each row execute function public.set_updated_at();

drop trigger if exists trg_funnel_steps_updated on public.funnel_steps;
create trigger trg_funnel_steps_updated
  before update on public.funnel_steps
  for each row execute function public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.client_funnels  enable row level security;
alter table public.funnel_steps    enable row level security;
alter table public.funnel_branches enable row level security;

drop policy if exists "Members manage funnels" on public.client_funnels;
create policy "Members manage funnels" on public.client_funnels
  for all to authenticated
  using (public.user_in_workspace(workspace_id, auth.uid()))
  with check (public.user_in_workspace(workspace_id, auth.uid()));

drop policy if exists "Members manage funnel_steps" on public.funnel_steps;
create policy "Members manage funnel_steps" on public.funnel_steps
  for all to authenticated
  using (public.user_in_workspace(workspace_id, auth.uid()))
  with check (public.user_in_workspace(workspace_id, auth.uid()));

drop policy if exists "Members manage funnel_branches" on public.funnel_branches;
create policy "Members manage funnel_branches" on public.funnel_branches
  for all to authenticated
  using (
    exists (
      select 1 from public.client_funnels f
      where f.id = funnel_branches.funnel_id
        and public.user_in_workspace(f.workspace_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.client_funnels f
      where f.id = funnel_branches.funnel_id
        and public.user_in_workspace(f.workspace_id, auth.uid())
    )
  );
