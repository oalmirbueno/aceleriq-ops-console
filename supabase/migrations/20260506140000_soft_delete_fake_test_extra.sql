-- Soft delete dos 4 IDs do teste fake (estende 20260506130000).
-- Nada de delete físico. Preserva timeline.

with target_clients(id) as (
  values
    ('2e369412-c8e3-4f1e-95fa-e3521b9eaf25'::uuid),
    ('2ec6c0b3-2d30-4a8f-a0e4-af8d3a95db27'::uuid)
),
target_workspaces(id) as (
  values
    ('896abf09-2457-4a20-84b4-16743bf8e595'::uuid),
    ('e76429b0-e201-4eeb-8bad-2a6db7e35130'::uuid)
)
select 1;

-- Clients
update public.clients
   set deleted_at  = coalesce(deleted_at, now()),
       sync_status = 'archived_legacy',
       status      = 'archived',
       updated_at  = now()
 where id in (
   '2e369412-c8e3-4f1e-95fa-e3521b9eaf25',
   '2ec6c0b3-2d30-4a8f-a0e4-af8d3a95db27'
 );

-- Workspaces (explícitos + qualquer workspace ligado aos clients fake)
update public.workspaces
   set deleted_at  = coalesce(deleted_at, now()),
       sync_status = 'archived_legacy',
       status      = 'archived',
       updated_at  = now()
 where id in (
   '896abf09-2457-4a20-84b4-16743bf8e595',
   'e76429b0-e201-4eeb-8bad-2a6db7e35130'
 )
    or client_id in (
   '2e369412-c8e3-4f1e-95fa-e3521b9eaf25',
   '2ec6c0b3-2d30-4a8f-a0e4-af8d3a95db27'
 );

-- Canvas nodes (milestones + nodes) de qualquer workspace fake
update public.canvas_nodes
   set deleted_at  = coalesce(deleted_at, now()),
       archived_at = coalesce(archived_at, now()),
       sync_status = 'archived_legacy',
       updated_at  = now()
 where workspace_id in (
   '896abf09-2457-4a20-84b4-16743bf8e595',
   'e76429b0-e201-4eeb-8bad-2a6db7e35130'
 )
    or client_id in (
   '2e369412-c8e3-4f1e-95fa-e3521b9eaf25',
   '2ec6c0b3-2d30-4a8f-a0e4-af8d3a95db27'
 );

-- Tasks (sem coluna deleted_at — usa status + metadata)
update public.tasks
   set status   = 'archived',
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'archived_at',     now(),
         'sync_status',     'archived_legacy',
         'archived_reason', 'fake_e2e_cleanup'
       ),
       updated_at = now()
 where workspace_id in (
   '896abf09-2457-4a20-84b4-16743bf8e595',
   'e76429b0-e201-4eeb-8bad-2a6db7e35130'
 )
    or client_id in (
   '2e369412-c8e3-4f1e-95fa-e3521b9eaf25',
   '2ec6c0b3-2d30-4a8f-a0e4-af8d3a95db27'
 );

-- Timeline event de auditoria (preserva histórico)
insert into public.timeline_events (workspace_id, client_id, event_type, title, description, happened_at)
select w.id, w.client_id, 'soft_delete_legacy', 'Teste fake arquivado',
       'Cleanup E2E fake: client+workspace+nodes+tasks soft-deleted. sync_status=archived_legacy.',
       now()
  from public.workspaces w
 where w.id in (
   '896abf09-2457-4a20-84b4-16743bf8e595',
   'e76429b0-e201-4eeb-8bad-2a6db7e35130'
 );
