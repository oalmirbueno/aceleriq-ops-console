-- Garante idempotência e realtime para tasks do Portal virarem nodes no Canvas Ops.

CREATE UNIQUE INDEX IF NOT EXISTS canvas_nodes_workspace_portal_task_id_key
  ON public.canvas_nodes (workspace_id, ((data ->> 'portal_task_id')))
  WHERE NULLIF(data ->> 'portal_task_id', '') IS NOT NULL;

ALTER TABLE public.canvas_nodes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_nodes;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END IF;
END $$;
