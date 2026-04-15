# Database Schema — Aceleriq Ops

## Tables

### clients
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| metadata | jsonb | |
| created_at | timestamptz | |

### workspaces
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| client_id | uuid FK → clients | |
| name | text | |
| plan_name | text | |
| metadata | jsonb | |
| created_at | timestamptz | |

### context_entries
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| workspace_id | uuid FK → workspaces | |
| client_id | uuid FK → clients | |
| context_type | text | briefing, objetivo, decisao, dor, acesso, anotacao, etc. |
| title | text | |
| content | text | Full document text (master document for briefings) |
| source_label | text | |
| source_url | text | |
| happened_at | timestamptz | |
| is_key_decision | boolean | |
| tags | text[] | |
| metadata | jsonb | See "Briefing Metadata" below |
| created_at | timestamptz | |

### tasks
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| workspace_id | uuid FK → workspaces | |
| client_id | uuid FK → clients | |
| title | text | |
| description | text | |
| status | text | todo, in_progress, done |
| priority | text | low, medium, high, critical |
| stage | text | Nullable, A.C.E.L.E.R.A stage |
| due_date | date | |
| assignee_id | uuid | |
| source_type | text | context, manual |
| source_id | uuid | |
| metadata | jsonb | |
| created_at | timestamptz | |

### timeline_events
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| workspace_id | uuid FK → workspaces | |
| client_id | uuid FK → clients | |
| event_type | text | |
| title | text | |
| description | text | |
| happened_at | timestamptz | |
| created_at | timestamptz | |

---

## Briefing Metadata (context_entries.metadata)

Briefings importados usam os seguintes campos padronizados em `metadata`:

| Field | Type | Description |
|-------|------|-------------|
| `briefing_kind` | string | Tipo: `"essential"`, `"sitebolt"` |
| `import_source` | string | Origem: `"pdf_upload"`, `"text_paste"`, `"legacy_import"` |
| `parser_mode` | string | Sempre `"local_rules"` nesta fase |
| `import_review_status` | string | `"pending_review"` → `"reviewed"` |
| `source_file_name` | string | Nome do arquivo importado |
| `structured_signals` | object | Sinais estruturados extraídos (ver abaixo) |
| `dossier_signals` | string[] | Blocos do Dossiê alimentados |
| `task_signals` | string[] | Signal keys relevantes para geração de tasks |
| `documentation_signals` | string[] | Signal keys relevantes para documentação |

### structured_signals

```jsonc
{
  "identity": { "summary": "...", "dossier_block": "identity" },
  "offer": { "summary": "...", "dossier_block": "offer" },
  "icp_persona": { "summary": "...", "dossier_block": "offer" },
  "pain_points": { "summary": "...", "dossier_block": "diagnostic" },
  "goals": { "summary": "...", "dossier_block": "offer" },
  "accesses": { "summary": "...", "dossier_block": "access" },
  "diagnosis": { "summary": "...", "dossier_block": "diagnostic" },
  "decisions": { "summary": "...", "dossier_block": "decisions" },
  "gaps": { "summary": "...", "dossier_block": "decisions" },
  "priorities": { "summary": "...", "dossier_block": "decisions" }
}
```

### Regras

- Briefing importado = **1 registro único** em `context_entries`. Não fragmentar.
- Sinais estruturados = leitura derivada leve, revisável, não substituem o documento bruto.
- Apenas briefings com `import_review_status = "reviewed"` alimentam automaticamente Dossiê, Wizard e geração de tasks.
- `pending_review` = visível no workspace mas fora da base automática.
- Nenhuma tabela extra é necessária para sinais estruturados.
