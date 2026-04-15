# Vision — Aceleriq Ops

## Propósito

Sistema operacional interno da Aceleriq para gestão de clientes, contexto estratégico e execução do método A.C.E.L.E.R.A.

## Princípios

1. **Fonte de verdade única**: cada briefing é um documento mestre, não fragmentado
2. **Transparência operacional**: sinais estruturados são auditáveis e editáveis pelo operador
3. **Revisão humana primeiro**: nenhum dado bruto alimenta automaticamente o plano operacional sem validação
4. **Simplicidade**: metadata em jsonb, sem tabelas extras desnecessárias
5. **Determinismo**: parsing por regras locais, sem dependência de IA opaca

## Modelo de Briefing

O briefing importado (PDF ou texto) é salvo como **1 entrada** em `context_entries` com:
- `briefing_kind`, `import_source`, `parser_mode`, `source_file_name`
- `import_review_status`: `pending_review` → `reviewed`
- `structured_signals`: blocos extraídos (identity, offer, icp_persona, pain_points, goals, accesses, diagnosis, decisions, gaps, priorities)
- `dossier_signals`, `task_signals`, `documentation_signals`: índices derivados

Apenas briefings **revisados** (`reviewed`) alimentam Dossiê, Wizard e geração de tasks.

## Roadmap Atual

- ✅ Shell visual (auth, sidebar, header, dashboard)
- ✅ Clientes e workspaces
- ✅ Contexto em pastas por tipo
- ✅ Briefing mestre + sinais estruturados
- ✅ Dossiê com priorização de sinais revisados
- ✅ Tasks manuais + geração a partir de contexto
- ✅ Wizard de plano operacional (A.C.E.L.E.R.A)
- ✅ Timeline
- ⬜ Enterprise Structuring
- ⬜ AI Automation layer
- ⬜ Canvas
