# Architecture — Aceleriq Ops

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Auth**: Mock via localStorage (Supabase auth pending)

## Modules

### Context (Contexto)
- Organizado em pastas por `context_type`
- Briefings importados entram como **documento mestre único**
- Parsing local determinístico via `briefingSignals.ts`
- Sinais estruturados salvos em `context_entries.metadata`

### Briefing Master Document
- 1 registro por briefing importado
- Texto integral preservado em `content`
- `metadata.structured_signals` contém blocos estruturados extraídos
- Revisão inline via `BriefingSignalReview.tsx`
- Status `reviewed` só é definido via fluxo de revisão de sinais

### Dossiê
- 11 blocos temáticos fixos
- Prioriza `structured_signals` de briefings revisados
- Briefings revisados com sinais válidos **não** poluem blocos via fallback de texto bruto
- Fallback por `context_type` ativo apenas quando não há sinais estruturados

### Task Generation
- `GenerateTasksDialog` e `TaskPlanningWizard` consomem `task_signals` revisados
- Briefings `pending_review` excluídos da seleção automática
- Geração baseada em regras determinísticas (`taskGenerationRules.ts`, `taskPlanningEngine.ts`)

### Timeline
- Eventos registrados automaticamente (criação de task, contexto, etc.)

## Key Design Decisions

1. **Sem fragmentação**: briefing nunca é quebrado em múltiplas `context_entries`
2. **Sem IA obrigatória**: parsing por regex/keywords, auditável
3. **Revisão humana obrigatória**: `pending_review` → `reviewed` via fluxo estruturado
4. **Metadata como extensão**: sinais estruturados vivem em jsonb, sem tabela extra
