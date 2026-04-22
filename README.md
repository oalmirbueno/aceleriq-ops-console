# Aceleriq Ops Console

Sistema operacional interno da Aceleriq para organizar contexto, briefing, dossiê, execução, produção, tarefas e canvas operacional por cliente/workspace.

## Stack

- React 18
- Vite 5
- TypeScript 5
- Tailwind CSS v3
- shadcn/ui
- React Flow (`@xyflow/react`) para o canvas
- Supabase client já configurado no projeto

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test
```

## Arquitetura resumida

- `src/pages` contém as telas principais do console.
- `src/components/workspace` concentra a operação do workspace: contexto, briefing, dossiê, tasks, produção, métricas, assets e canvas.
- `src/components/workspace/canvasProjectTypes.ts` define a gramática operacional dos tipos de nodes do canvas.
- `src/config/featureFlags.ts` controla a ativação segura de camadas do canvas.
- `supabase/functions` concentra funções server-side já existentes para parsing, briefing público, prefill e invocações assistivas.

## Modelo de briefing

Regras críticas do projeto:

- Briefing importado é **1 registro único** em `context_entries`.
- Sinais estruturados vivem em `context_entries.metadata.structured_signals`.
- Briefings com `pending_review` ficam fora da geração automática de dossiê, wizard e tasks.
- O parser local determinístico é a base; IA pode assistir, mas não é núcleo obrigatório.
- Não criar tabela nova para sinais estruturados.

## Relação entre Briefing, Dossiê, Wizard e Canvas

- **Briefing**: fonte mestre de contexto bruto e sinais estruturados revisados.
- **Dossiê**: camada de leitura consolidada para consulta operacional.
- **Wizard / operationalPlanEngine**: transforma sinais e contexto revisado em plano e tasks previsíveis.
- **Canvas**: camada visual operacional complementar para organizar fluxo, dependências, handoffs, aprovações, evidências e relação com tasks.

Regra de ouro: **o Canvas complementa, não substitui a base determinística do projeto**.

## Papel do Canvas

O canvas existe como feature controlada por flags e mantém a aba disponível sem remover implementação. Ele segue uma gramática operacional:

```text
Contexto/Instrução → Engine → Resultado → Decisão → Próxima ação
```

Conexões secundárias permitidas:

```text
Contexto → Resultado = referência
```

O canvas não cria uma nova lógica de sinais, não substitui briefing/dossiê/wizard e não usa IA opaca como núcleo decisório.

## Convenções de evolução

- Não remover módulos existentes sem decisão explícita.
- Preferir metadata/jsonb para vínculos leves e auditáveis.
- Evitar refactors agressivos em `CanvasStudio.tsx`.
- Manter dark theme e tokens semânticos do design system.
- Preservar a aba Canvas e o fluxo atual de execução.
