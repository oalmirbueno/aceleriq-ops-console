-- Adiciona coluna `metadata jsonb` em canvas_nodes
-- Usada por: useNodePrefill (prefill cache), prefill-node edge function,
-- IaAgentNodeDrawer (prompt_versions), attachments. Sem essa coluna o app
-- entrava em loop de 400 ("column canvas_nodes.metadata does not exist").
ALTER TABLE public.canvas_nodes
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS canvas_nodes_metadata_gin
  ON public.canvas_nodes USING gin (metadata);
