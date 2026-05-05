-- Deduplica project_groups por (workspace_id, portal_project_id):
-- mantém o mais antigo, repara parent_node_id de descendentes para apontarem
-- para o sobrevivente, e remove os duplicados. Roda 1x na migração e cria
-- índice único parcial pra impedir novas duplicações.

with groups as (
  select
    id,
    workspace_id,
    (data->>'portal_project_id') as portal_project_id,
    created_at,
    row_number() over (
      partition by workspace_id, (data->>'portal_project_id')
      order by created_at asc, id asc
    ) as rn
  from public.canvas_nodes
  where (data->>'kind') = 'project_group'
    and (data->>'portal_project_id') is not null
    and length(data->>'portal_project_id') > 0
),
survivors as (
  select workspace_id, portal_project_id, id as keeper_id
  from groups where rn = 1
),
duplicates as (
  select g.id as dup_id, s.keeper_id
  from groups g
  join survivors s
    on s.workspace_id = g.workspace_id
   and s.portal_project_id = g.portal_project_id
  where g.rn > 1
)
update public.canvas_nodes c
set parent_node_id = d.keeper_id,
    updated_at = now()
from duplicates d
where c.parent_node_id = d.dup_id;

-- Reaponta milestone_groups que ficaram órfãos via portal_project_id (caso o
-- parent não estivesse setado e sim só o portal_project_id no data).
with groups as (
  select id, workspace_id, (data->>'portal_project_id') as portal_project_id, created_at,
         row_number() over (partition by workspace_id, (data->>'portal_project_id') order by created_at asc, id asc) as rn
  from public.canvas_nodes
  where (data->>'kind') = 'project_group' and (data->>'portal_project_id') is not null
)
delete from public.canvas_nodes c
using groups g
where g.rn > 1 and c.id = g.id;

-- Índice único parcial: impede novos duplicados mantendo NULL livre.
create unique index if not exists canvas_nodes_unique_project_group_per_workspace
  on public.canvas_nodes (workspace_id, ((data->>'portal_project_id')))
  where (data->>'kind') = 'project_group'
    and (data->>'portal_project_id') is not null
    and length(data->>'portal_project_id') > 0;
