-- Soft delete of fake E2E test data created by broken flow.
update public.clients
   set deleted_at = coalesce(deleted_at, now()),
       sync_status = 'archived_legacy',
       status = 'archived'
 where id = '2e369412-c8e3-4f1e-95fa-e3521b9eaf25';

update public.workspaces
   set deleted_at = coalesce(deleted_at, now()),
       sync_status = 'archived_legacy',
       status = 'archived'
 where id = '896abf09-2457-4a20-84b4-16743bf8e595';

update public.canvas_nodes
   set deleted_at = coalesce(deleted_at, now()),
       archived_at = coalesce(archived_at, now()),
       sync_status = 'archived_legacy'
 where workspace_id = '896abf09-2457-4a20-84b4-16743bf8e595';

update public.tasks
   set status = 'archived',
       metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object(
                       'archived_at', now(),
                       'sync_status', 'archived_legacy',
                       'archived_reason', 'fake_e2e_cleanup'
                     )
 where workspace_id = '896abf09-2457-4a20-84b4-16743bf8e595'
    or client_id    = '2e369412-c8e3-4f1e-95fa-e3521b9eaf25';

insert into public.timeline_events (workspace_id, client_id, event_type, title, description, happened_at)
values (
  '896abf09-2457-4a20-84b4-16743bf8e595',
  '2e369412-c8e3-4f1e-95fa-e3521b9eaf25',
  'soft_delete_legacy',
  'Teste fake arquivado',
  'Soft delete do client/workspace/nodes/tasks do teste E2E fake quebrado. sync_status=archived_legacy.',
  now()
);
