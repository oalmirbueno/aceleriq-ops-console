# Claude Instructions — Aceleriq Ops

## Project Context

Aceleriq Ops é um sistema operacional interno. Dark theme, primary green, Outfit font.

## Briefing Model (Critical)

- Briefing importado = **1 registro único** em `context_entries`
- **Nunca fragmentar** briefing em múltiplas entries
- Sinais estruturados vivem em `context_entries.metadata.structured_signals`
- Parser determinístico local (`briefingSignals.ts`), sem IA obrigatória
- `parser_mode` = `"local_rules"`

### Metadata padronizada do briefing mestre

```
briefing_kind: "essential" | "sitebolt"
import_source: "pdf_upload" | "text_paste" | "legacy_import"
parser_mode: "local_rules" | "ai_assist"
import_review_status: "pending_review" | "reviewed"
source_file_name: string
structured_signals: { [key]: { summary, dossier_block } }
dossier_signals: string[]
task_signals: string[]
documentation_signals: string[]
```

### Signal block keys

`identity`, `offer`, `icp_persona`, `pain_points`, `goals`, `accesses`, `diagnosis`, `decisions`, `gaps`, `priorities`

## Rules

1. `pending_review` briefings ficam **fora** da base automática de Dossiê, Wizard e tasks
2. Status `reviewed` só é definido via fluxo de revisão de sinais (`BriefingSignalReview.tsx`)
3. Dossiê prioriza sinais estruturados; briefing bruto excluído dos blocos quando há sinais válidos
4. Não criar tabela nova para sinais
5. Não reintroduzir IA opaca como núcleo
6. Canvas desabilitado
7. Não mexer em módulos fora do escopo solicitado
