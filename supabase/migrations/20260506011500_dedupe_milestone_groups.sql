-- Deduplica milestone_groups por (workspace_id, portal_milestone_id) e por
-- (workspace_id, portal_project_id, milestone_key). Reaponta filhos pra o
-- sobrevivente (mais antigo) e cria índices únicos parciais pra evitar novas
-- duplicações.

-- ── 1) Dedupe por portal_milestone_id ──────────────────────────────────
with groups as (
  select id, workspace_id, (data->>'portal_milestone_id') as pmid, created_at,
         row_number() over (
           partition by workspace_id, (data->>'portal_milestone_id')
           order by created_at asc, id asc
         ) as rn
  from public.canvas_nodes
  where (data->>'kind') = 'milestone_group'
    and (data->>'portal_milestone_id') is not null
    and length(data->>'portal_milestone_id') > 0
),
survivors as (select workspace_id, pmid, id as keeper_id from groups where rn = 1),
dups as (
  select g.id as dup_id, s.keeper_id
  from groups g
  join survivors s on s.workspace_id = g.workspace_id and s.pmid = g.pmid
  where g.rn > 1
)
update public.canvas_nodes c
set parent_node_id = d.keeper_id, updated_at = now()
from dups d
where c.parent_node_id = d.dup_id;

with groups as (
  select id, workspace_id, (data->>'portal_milestone_id') as pmid, created_at,
         row_number() over (partition by workspace_id, (data->>'portal_milestone_id') order by created_at asc, id asc) as rn
  from public.canvas_nodes
  where (data->>'kind') = 'milestone_group' and (data->>'portal_milestone_id') is not null
)
delete from public.canvas_nodes c using groups g
where g.rn > 1 and c.id = g.id;

-- ── 2) Dedupe por (portal_project_id, milestone_key) — quando não há portal_milestone_id ──
with groups as (
  select id, workspace_id,
         (data->>'portal_project_id') as ppid,
         (data->>'milestone_key') as mkey,
         created_at,
         row_number() over (
           partition by workspace_id, (data->>'portal_project_id'), (data->>'milestone_key')
           order by created_at asc, id asc
         ) as rn
  from public.canvas_nodes
  where (data->>'kind') = 'milestone_group'
    and (data->>'portal_project_id') is not null
    and (data->>'milestone_key') is not null
    and length(data->>'milestone_key') > 0
),
survivors as (select workspace_id, ppid, mkey, id as keeper_id from groups where rn = 1),
dups as (
  select g.id as dup_id, s.keeper_id
  from groups g
  join survivors s
    on s.workspace_id = g.workspace_id and s.ppid = g.ppid and s.mkey = g.mkey
  where g.rn > 1
)
update public.canvas_nodes c
set parent_node_id = d.keeper_id, updated_at = now()
from dups d
where c.parent_node_id = d.dup_id;

with groups as (
  select id, workspace_id,
         (data->>'portal_project_id') as ppid,
         (data->>'milestone_key') as mkey,
         created_at,
         row_number() over (partition by workspace_id, (data->>'portal_project_id'), (data->>'milestone_key') order by created_at asc, id asc) as rn
  from public.canvas_nodes
  where (data->>'kind') = 'milestone_group'
    and (data->>'portal_project_id') is not null
    and (data->>'milestone_key') is not null
)
delete from public.canvas_nodes c using groups g
where g.rn > 1 and c.id = g.id;

-- ── 3) Índices únicos parciais ─────────────────────────────────────────
create unique index if not exists canvas_nodes_unique_milestone_group_pmid
  on public.canvas_nodes (workspace_id, ((data->>'portal_milestone_id')))
  where (data->>'kind') = 'milestone_group'
    and (data->>'portal_milestone_id') is not null
    and length(data->>'portal_milestone_id') > 0;

create unique index if not exists canvas_nodes_unique_milestone_group_mkey
  on public.canvas_nodes (workspace_id, ((data->>'portal_project_id')), ((data->>'milestone_key')))
  where (data->>'kind') = 'milestone_group'
    and (data->>'portal_project_id') is not null
    and (data->>'milestone_key') is not null
    and length(data->>'milestone_key') > 0;
