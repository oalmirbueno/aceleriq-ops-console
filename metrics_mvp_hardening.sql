-- ===========================================
-- METRICS MVP HARDENING - FINAL VERSION
-- ===========================================
-- Segue o padrão canônico do projeto: public.is_workspace_member()
-- Não usa workspaces.primary_owner_id diretamente
-- ===========================================

-- 1. CRIAR HELPER SE NÃO EXISTIR (garantia de compatibilidade)
-- Já deve existir no projeto, mas incluído para idempotência
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.profile_id = auth.uid()
    UNION
    SELECT 1 FROM workspaces w
    WHERE w.id = p_workspace_id
      AND w.primary_owner_id = auth.uid()
  )
$$;

-- 2. GARANTIR CAMPOS NECESSÁRIOS NA TABELA
-- Adiciona campos se ainda não existirem (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'metric_snapshots' AND column_name = 'metric_unit'
  ) THEN
    ALTER TABLE public.metric_snapshots ADD COLUMN metric_unit text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'metric_snapshots' AND column_name = 'period_label'
  ) THEN
    ALTER TABLE public.metric_snapshots ADD COLUMN period_label text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'metric_snapshots' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE public.metric_snapshots ADD COLUMN source_type text DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'metric_snapshots' AND column_name = 'source_label'
  ) THEN
    ALTER TABLE public.metric_snapshots ADD COLUMN source_label text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'metric_snapshots' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.metric_snapshots ADD COLUMN notes text;
  END IF;
END
$$;

-- 3. ÍNDICES ÚTEIS PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_workspace_key 
  ON public.metric_snapshots(workspace_id, metric_key, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_captured 
  ON public.metric_snapshots(captured_at DESC);

-- 4. REMOVER POLICY PERMISSIVA ANTIGA (se existir)
DROP POLICY IF EXISTS metric_snapshots_all_authenticated ON public.metric_snapshots;

-- ===========================================
-- 5. POLICIES FINAIS - PADRÃO CANÔNICO
-- Usando public.is_workspace_member(workspace_id)
-- ===========================================

-- SELECT: Membros podem ler métricas do workspace
CREATE POLICY "metric_snapshots_select_member" 
ON public.metric_snapshots 
FOR SELECT 
TO authenticated 
USING (public.is_workspace_member(workspace_id));

-- INSERT: Membros podem criar snapshots
CREATE POLICY "metric_snapshots_insert_member" 
ON public.metric_snapshots 
FOR INSERT 
TO authenticated 
WITH CHECK (public.is_workspace_member(workspace_id));

-- UPDATE: Membros podem atualizar snapshots
CREATE POLICY "metric_snapshots_update_member" 
ON public.metric_snapshots 
FOR UPDATE 
TO authenticated 
USING (public.is_workspace_member(workspace_id)) 
WITH CHECK (public.is_workspace_member(workspace_id));

-- DELETE: Membros podem remover snapshots
CREATE POLICY "metric_snapshots_delete_member" 
ON public.metric_snapshots 
FOR DELETE 
TO authenticated 
USING (public.is_workspace_member(workspace_id));

-- 6. GARANTIR RLS ATIVADO
ALTER TABLE public.metric_snapshots ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- RESUMO
-- ===========================================
-- • Campos mínimos garantidos (metric_unit, period_label, source_type, source_label, notes)
-- • Índices para queries frequentes (por workspace+key+data, por data)
-- • Policy permissiva removida
-- • 4 policies escopadas via public.is_workspace_member()
-- • Padrão consistente com Plano 0 e demais tabelas do projeto
-- ===========================================