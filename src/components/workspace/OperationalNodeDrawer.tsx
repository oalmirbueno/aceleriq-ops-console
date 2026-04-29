/**
 * OperationalNodeDrawer — drawer de construção operacional.
 *
 * PREMISSA FUNDAMENTAL:
 * O canvas Aceleriq é uma ESTEIRA DE PRODUÇÃO E IMPLEMENTAÇÃO.
 * Cada node representa um entregável sendo CONSTRUÍDO para o cliente.
 * Os campos não são sobre "usar" — são sobre "o que construir, como construir,
 * quem faz, qual o critério de aceite, o que já está feito".
 *
 * Exemplos:
 *  - landing_page: construir a landing page do cliente (objetivo, copy, stack, prazo)
 *  - crm:          implantar o CRM no negócio do cliente (plataforma, funil, integrações)
 *  - ia / agente:  construir o agente IA para o cliente (persona, prompt, testes)
 *  - automacao:    criar a automação no workflow do cliente (trigger, fluxo, go-live)
 *  - site:         desenvolver e publicar o site do cliente (pages, stack, deploy)
 *  - case:         documentar o resultado obtido (PASTA)
 *  - metrica:      instrumentar a medição (fórmula, fonte, baseline)
 *  - conteudo:     produzir o conteúdo do cliente (roteiro, produção, publicação)
 */
import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, Sparkles, MessageCircle, Loader2, CheckCircle2, Circle, Workflow, KeyRound, ExternalLink, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { syncNodeCompletedWhenDone } from "./syncToPortalEvents";
import { getProjectTypeMeta, resolveProjectNodeKind, type ProjectNodeKind } from "./canvasProjectTypes";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  onDelete?: (id: string) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
  onOpenChat?: (nodeId: string) => void;
}

type FieldType = "text" | "textarea" | "select" | "checklist";

type FieldDef = {
  id: string;
  label: string;
  type: FieldType;
  hint?: string;
  options?: string[];
  placeholder?: string;
  rows?: number;
  checkItems?: string[]; // for checklist type
};

type SectionDef = {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
};

type KindConfig = {
  title: string;
  subtitle: string;
  accent: string;
  context: string; // explains what this node IS in the production flow
  aiPrompt: string;
  sections: SectionDef[];
};

// ─── KIND CONFIGS ────────────────────────────────────────────
// Cada config reflete a lógica de CONSTRUÇÃO, não de uso.

const KIND_CONFIGS: Partial<Record<ProjectNodeKind, KindConfig>> = {

  // ── ENTRADAS / CONTEXTO ──────────────────────────────────────────────────

  briefing: {
    title: "Briefing",
    subtitle: "Captura e consolida contexto do cliente",
    accent: "#00FF88",
    context: "Entrada da esteira: centraliza tudo que o cliente precisa comunicar para que a equipe possa produzir com qualidade.",
    aiPrompt: "Com base no contexto disponível, preencha o briefing operacional: empresa, mercado, objetivos, restrições, personas, KPIs esperados.",
    sections: [
      {
        id: "empresa",
        title: "Empresa e posicionamento",
        description: "O que você já sabe sobre o negócio do cliente",
        fields: [
          { id: "company", label: "Empresa", type: "text" },
          { id: "positioning", label: "Posicionamento atual", type: "textarea", rows: 2, placeholder: "Como o cliente se posiciona hoje no mercado" },
          { id: "differentiator", label: "Diferencial real", type: "textarea", rows: 2, placeholder: "O que o cliente entrega que concorrente não entrega" },
          { id: "constraints", label: "Restrições e não-fazer", type: "textarea", rows: 2, placeholder: "Orçamento, prazo, o que NÃO pode ser feito" },
        ],
      },
      {
        id: "mercado",
        title: "Mercado e cliente ideal",
        fields: [
          { id: "icp", label: "Quem é o cliente ideal (ICP)", type: "textarea", rows: 3, placeholder: "Perfil, dores, momento de compra, objeções" },
          { id: "competitors", label: "Concorrentes diretos", type: "text" },
          { id: "market_moment", label: "Momento do mercado", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "objetivos",
        title: "Objetivos e métricas",
        fields: [
          { id: "goals_90d", label: "O que precisa estar pronto em 90 dias", type: "textarea", rows: 3 },
          { id: "kpis", label: "KPIs que o cliente acompanha hoje", type: "textarea", rows: 2 },
          { id: "success_criteria", label: "O que é sucesso para o cliente", type: "textarea", rows: 2 },
        ],
      },
    ],
  },

  contexto_ops: {
    title: "Contexto operacional",
    subtitle: "Referência e insumos para o fluxo",
    accent: "#00FF88",
    context: "Alimenta outros nodes com dados de referência: assets, regras de marca, pesquisas, dados históricos.",
    aiPrompt: "Organize o contexto operacional disponível: assets existentes, regras de marca, dados de referência, histórico relevante.",
    sections: [
      {
        id: "assets",
        title: "Assets e referências disponíveis",
        fields: [
          { id: "brand_assets", label: "Assets de marca (logo, cores, fontes)", type: "textarea", rows: 2 },
          { id: "existing_content", label: "Conteúdo existente relevante", type: "textarea", rows: 2 },
          { id: "data_references", label: "Dados e pesquisas de referência", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "regras",
        title: "Regras e restrições",
        fields: [
          { id: "brand_rules", label: "Tom de voz e regras de marca", type: "textarea", rows: 3 },
          { id: "restrictions", label: "O que NÃO pode aparecer", type: "textarea", rows: 2 },
        ],
      },
    ],
  },

  instrucao: {
    title: "Instrução / SOP",
    subtitle: "Como executar esse entregável",
    accent: "#94A3B8",
    context: "Define as regras de execução: o que fazer, como fazer, critérios de aceite. Alimenta engines e agentes.",
    aiPrompt: "Crie um SOP para este entregável: objetivo, passos de execução, responsável, output esperado, critérios de aceite, exceções.",
    sections: [
      {
        id: "objetivo",
        title: "O que precisa ser feito",
        fields: [
          { id: "goal", label: "Objetivo do entregável", type: "textarea", rows: 2 },
          { id: "owner", label: "Responsável pela execução", type: "text" },
          { id: "deadline", label: "Prazo esperado", type: "text" },
        ],
      },
      {
        id: "execucao",
        title: "Como executar",
        fields: [
          { id: "steps", label: "Passos (em ordem)", type: "textarea", rows: 6, placeholder: "1. …\n2. …\n3. …" },
          { id: "inputs", label: "O que precisa como entrada", type: "textarea", rows: 2 },
          { id: "output", label: "Output esperado ao final", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "criterios",
        title: "Critérios de aceite",
        fields: [
          { id: "acceptance", label: "Como saber que está pronto", type: "textarea", rows: 3 },
          { id: "exceptions", label: "Exceções e casos especiais", type: "textarea", rows: 2 },
        ],
      },
    ],
  },

  engine: {
    title: "Engine de orquestração",
    subtitle: "Centraliza entradas e coordena saídas",
    accent: "#7C3AED",
    context: "Ponto central do fluxo: recebe contexto + instrução, coordena agentes e gera o resultado principal.",
    aiPrompt: "Configure esta engine: qual problema resolve, quais entradas precisa, como processa, quais saídas gera.",
    sections: [
      {
        id: "proposito",
        title: "Propósito da engine",
        fields: [
          { id: "problem", label: "Que problema essa engine resolve", type: "textarea", rows: 2 },
          { id: "inputs_required", label: "Entradas necessárias (nodes conectados)", type: "textarea", rows: 3 },
          { id: "outputs", label: "O que ela produz", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "logica",
        title: "Lógica de processamento",
        fields: [
          { id: "processing", label: "Como processa as entradas", type: "textarea", rows: 4 },
          { id: "dependencies", label: "Dependências críticas", type: "textarea", rows: 2 },
          { id: "handoffs", label: "O que passa para quem", type: "textarea", rows: 2 },
        ],
      },
    ],
  },

  // ── ENTREGÁVEIS DIGITAIS ──────────────────────────────────────────────────

  landing_page: {
    title: "Landing Page",
    subtitle: "Construir uma página de conversão",
    accent: "#E879F9",
    context: "Entregável: página de alta conversão sendo desenvolvida para o cliente. Foco em copy, estrutura e tracking.",
    aiPrompt: "Com base no briefing do cliente, construa a estrutura completa desta landing page: headline, promessa, mecanismo único, prova social, CTA e tracking.",
    sections: [
      {
        id: "objetivo",
        title: "O que estamos construindo",
        fields: [
          { id: "goal", label: "Objetivo da página", type: "text", placeholder: "capturar leads / vender produto X / agendar demo" },
          { id: "audience", label: "Para quem é essa página", type: "textarea", rows: 2, placeholder: "perfil do visitante + momento de consciência" },
          { id: "platform", label: "Plataforma / stack", type: "text", placeholder: "Lovable, Webflow, WordPress, Next.js..." },
          { id: "deadline", label: "Prazo de entrega", type: "text" },
        ],
      },
      {
        id: "copy",
        title: "Copy e promessa central",
        fields: [
          { id: "headline", label: "Headline principal", type: "text", placeholder: "[resultado] para [quem] em [tempo]" },
          { id: "mechanism", label: "Mecanismo único (por que só você)", type: "textarea", rows: 2 },
          { id: "pain_points", label: "3 dores que a página aborda", type: "textarea", rows: 3 },
          { id: "proof", label: "Provas sociais disponíveis", type: "textarea", rows: 2, placeholder: "depoimentos, logos, números, cases" },
          { id: "guarantee", label: "Garantia / risco-zero", type: "text" },
          { id: "cta", label: "CTA principal", type: "text", placeholder: "verbo forte + benefício imediato" },
        ],
      },
      {
        id: "tecnico",
        title: "Implementação",
        fields: [
          { id: "domain", label: "Domínio / URL", type: "text" },
          { id: "integrations", label: "Integrações necessárias", type: "textarea", rows: 2, placeholder: "CRM, e-mail, Pixel Meta, GA4, GTM" },
          { id: "tracking", label: "Eventos de tracking a configurar", type: "textarea", rows: 2 },
          { id: "status_impl", label: "Status da implementação", type: "select", options: ["Planejado", "Em desenvolvimento", "Em revisão", "Publicado", "Otimizando"] },
        ],
      },
    ],
  },

  site: {
    title: "Site",
    subtitle: "Desenvolver e publicar o site do cliente",
    accent: "#60A5FA",
    context: "Entregável: site corporativo/institucional sendo construído. Abrange arquitetura, desenvolvimento e publicação.",
    aiPrompt: "Estruture o projeto de site: objetivo, páginas necessárias, stack, integrações, cronograma de entrega.",
    sections: [
      {
        id: "projeto",
        title: "Projeto do site",
        fields: [
          { id: "purpose", label: "Objetivo do site", type: "textarea", rows: 2 },
          { id: "domain", label: "Domínio", type: "text" },
          { id: "stack", label: "Stack / plataforma", type: "text", placeholder: "Lovable, Next.js, WordPress, Webflow..." },
          { id: "deadline", label: "Prazo de publicação", type: "text" },
        ],
      },
      {
        id: "estrutura",
        title: "Estrutura e páginas",
        fields: [
          { id: "sitemap", label: "Mapa de páginas (sitemap)", type: "textarea", rows: 5, placeholder: "Home\nSobre\nServiços\n  - Serviço A\n  - Serviço B\nContato" },
          { id: "main_cta", label: "CTA principal do site", type: "text" },
          { id: "seo_keywords", label: "Palavras-chave SEO prioritárias", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "implementacao",
        title: "Implementação e deploy",
        fields: [
          { id: "hosting", label: "Hospedagem / hosting", type: "text" },
          { id: "integrations", label: "Integrações (CRM, analytics, chat)", type: "textarea", rows: 2 },
          { id: "checklist_launch", label: "Checklist de go-live", type: "textarea", rows: 3, placeholder: "SSL, GTM, robots.txt, sitemap.xml, pixels, velocidade..." },
          { id: "status_impl", label: "Status", type: "select", options: ["Planejado", "Wireframe", "Design", "Desenvolvimento", "Revisão", "Publicado"] },
        ],
      },
    ],
  },

  crm: {
    title: "CRM / Pipeline comercial",
    subtitle: "Implantar e configurar o CRM do cliente",
    accent: "#8B5CF6",
    context: "Entregável: implantação do CRM no negócio do cliente. Desde escolha da plataforma até configuração do pipeline e treinamento.",
    aiPrompt: "Com base no negócio do cliente, estruture a implantação do CRM: plataforma ideal, etapas do pipeline, campos obrigatórios, automações, integrações e critérios de go-live.",
    sections: [
      {
        id: "diagnostico",
        title: "Diagnóstico e escolha",
        fields: [
          { id: "current_state", label: "Como o cliente gerencia leads hoje", type: "textarea", rows: 2, placeholder: "planilha, WhatsApp, nada, outro CRM..." },
          { id: "volume", label: "Volume de leads por mês", type: "text" },
          { id: "team_size", label: "Tamanho do time comercial", type: "text" },
          { id: "platform", label: "Plataforma escolhida / a escolher", type: "text", placeholder: "HubSpot, RD Station, Pipedrive, Notion, etc." },
          { id: "budget", label: "Budget disponível / mês", type: "text" },
        ],
      },
      {
        id: "pipeline",
        title: "Construção do pipeline",
        fields: [
          { id: "stages", label: "Etapas do funil comercial", type: "textarea", rows: 4, placeholder: "Lead novo\nQualificado\nApresentação\nProposta\nNegociação\nFechado" },
          { id: "entry_criteria", label: "Critério de entrada em cada etapa", type: "textarea", rows: 3 },
          { id: "required_fields", label: "Campos obrigatórios por etapa", type: "textarea", rows: 3 },
          { id: "sla", label: "SLA máximo por etapa (horas/dias)", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "automacoes",
        title: "Automações e integrações",
        fields: [
          { id: "automations", label: "Automações a configurar", type: "textarea", rows: 3, placeholder: "notificação de novo lead, follow-up D+1, alerta de SLA..." },
          { id: "integrations", label: "Integrações necessárias", type: "textarea", rows: 2, placeholder: "formulário do site, WhatsApp, e-mail marketing..." },
          { id: "lead_source", label: "Fontes de lead a rastrear", type: "text" },
        ],
      },
      {
        id: "golive",
        title: "Go-live e treinamento",
        fields: [
          { id: "migration", label: "Migração de dados históricos", type: "textarea", rows: 2 },
          { id: "training", label: "Treinamento do time (quem, quando, como)", type: "textarea", rows: 2 },
          { id: "go_live_date", label: "Data de go-live", type: "text" },
          { id: "status_impl", label: "Status da implantação", type: "select", options: ["Diagnóstico", "Configuração", "Teste", "Migração", "Treinamento", "Go-live", "Monitorando"] },
        ],
      },
    ],
  },

  ia: {
    title: "Agente de IA",
    subtitle: "Construir um agente inteligente para o cliente",
    accent: "#06B6D4",
    context: "Entregável: agente IA sendo desenvolvido e implantado no negócio do cliente. Desde persona e prompt até testes e go-live.",
    aiPrompt: "Com base no contexto do cliente, projete este agente IA: propósito, persona, system prompt, ferramentas, guardrails, casos de teste e plano de go-live.",
    sections: [
      {
        id: "proposito",
        title: "O que o agente vai fazer",
        fields: [
          { id: "problem", label: "Problema que o agente resolve", type: "textarea", rows: 2 },
          { id: "user", label: "Quem vai usar o agente", type: "text" },
          { id: "channel", label: "Canal de uso", type: "text", placeholder: "Chat no site, WhatsApp, Slack, app interno..." },
          { id: "success", label: "Definição de sucesso", type: "textarea", rows: 2, placeholder: "Quando uma conversa é boa?" },
        ],
      },
      {
        id: "construcao",
        title: "Construção do agente",
        fields: [
          { id: "platform", label: "Plataforma / stack", type: "text", placeholder: "Lovable AI Gateway, OpenAI, Claude, Voiceflow, n8n..." },
          { id: "model", label: "Modelo de linguagem", type: "text", placeholder: "gemini-3-flash-preview, gpt-4o, claude-3.5-sonnet..." },
          { id: "persona", label: "Persona / tom de voz", type: "textarea", rows: 2 },
          { id: "system_prompt", label: "System prompt", type: "textarea", rows: 6, placeholder: "Você é [nome], especialista em [área], trabalhando para [empresa]..." },
        ],
      },
      {
        id: "ferramentas",
        title: "Ferramentas e base de conhecimento",
        fields: [
          { id: "tools", label: "Tools / funções disponíveis", type: "textarea", rows: 3, placeholder: "busca_produto(query), criar_ticket(dados), consultar_agenda..." },
          { id: "knowledge_base", label: "Base de conhecimento", type: "textarea", rows: 2, placeholder: "FAQ, documentos, links, embeds..." },
          { id: "guardrails", label: "O que o agente NÃO pode fazer", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "golive",
        title: "Testes e go-live",
        fields: [
          { id: "test_cases", label: "Casos de teste (input → output esperado)", type: "textarea", rows: 4 },
          { id: "go_live_plan", label: "Plano de go-live", type: "textarea", rows: 2 },
          { id: "status_impl", label: "Status", type: "select", options: ["Conceito", "Prompt em desenvolvimento", "Em teste", "Revisão cliente", "Go-live", "Monitorando"] },
        ],
      },
    ],
  },

  agente: {
    title: "Agente operacional",
    subtitle: "Construir agente de execução no workflow",
    accent: "#06B6D4",
    context: "Entregável: agente que executa tarefas dentro do fluxo operacional do cliente. Foco em automação e handoffs.",
    aiPrompt: "Configure este agente operacional para o cliente: objetivo, trigger, passos de execução, handoffs, monitoramento.",
    sections: [
      {
        id: "funcao",
        title: "Função no workflow",
        fields: [
          { id: "goal", label: "O que esse agente executa", type: "textarea", rows: 2 },
          { id: "trigger", label: "O que dispara o agente", type: "text" },
          { id: "inputs", label: "Dados que recebe", type: "textarea", rows: 2 },
          { id: "output", label: "O que entrega ao final", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "execucao",
        title: "Construção da execução",
        fields: [
          { id: "steps", label: "Passos de execução (em ordem)", type: "textarea", rows: 5 },
          { id: "handoffs", label: "Quando passa para humano", type: "textarea", rows: 2 },
          { id: "error_handling", label: "O que fazer se falhar", type: "textarea", rows: 2 },
          { id: "status_impl", label: "Status", type: "select", options: ["Mapeando", "Construindo", "Testando", "Ativo", "Ajustando"] },
        ],
      },
    ],
  },

  automacao: {
    title: "Automação",
    subtitle: "Criar automação no workflow do cliente",
    accent: "#34D399",
    context: "Entregável: automação sendo construída e implantada no negócio do cliente. Foco em eliminar trabalho manual repetitivo.",
    aiPrompt: "Com base no contexto do cliente, projete esta automação: o que automatiza, trigger, fluxo passo a passo, integrações, ROI estimado.",
    sections: [
      {
        id: "problema",
        title: "O que vamos automatizar",
        fields: [
          { id: "manual_task", label: "Tarefa manual atual (como é feito hoje)", type: "textarea", rows: 2 },
          { id: "frequency", label: "Frequência / volume", type: "text", placeholder: "X vezes por dia/semana" },
          { id: "time_spent", label: "Tempo gasto hoje (horas/mês)", type: "text" },
          { id: "roi_expected", label: "ROI esperado", type: "text", placeholder: "X horas/mês economizadas" },
        ],
      },
      {
        id: "construcao",
        title: "Construção da automação",
        fields: [
          { id: "platform", label: "Plataforma", type: "text", placeholder: "n8n, Make, Zapier, código próprio..." },
          { id: "trigger", label: "Trigger", type: "text", placeholder: "webhook / cron / evento / form submit" },
          { id: "steps", label: "Fluxo passo a passo", type: "textarea", rows: 6, placeholder: "1. Recebe dados\n2. Valida\n3. Processa\n4. Envia resultado\n5. Log" },
          { id: "integrations", label: "Integrações necessárias", type: "textarea", rows: 2 },
          { id: "fallback", label: "Fallback / tratamento de erro", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "golive",
        title: "Teste e go-live",
        fields: [
          { id: "test_scenario", label: "Cenário de teste", type: "textarea", rows: 2 },
          { id: "monitoring", label: "Onde monitora (logs, alertas)", type: "text" },
          { id: "status_impl", label: "Status", type: "select", options: ["Mapeando", "Construindo", "Testando", "Ativo", "Otimizando"] },
        ],
      },
    ],
  },

  funil: {
    title: "Funil de vendas",
    subtitle: "Construir o funil de aquisição do cliente",
    accent: "#F97316",
    context: "Entregável: funil de vendas sendo estruturado e implementado. Desde topo de funil até conversão.",
    aiPrompt: "Estruture o funil de vendas do cliente: topo, meio, fundo, ferramentas de cada etapa, automações e métricas.",
    sections: [
      {
        id: "estrutura",
        title: "Estrutura do funil",
        fields: [
          { id: "tofu", label: "Topo (atração)", type: "textarea", rows: 2, placeholder: "Canais e conteúdo para gerar tráfego" },
          { id: "mofu", label: "Meio (engajamento/nutrição)", type: "textarea", rows: 2, placeholder: "Como nutrir e qualificar leads" },
          { id: "bofu", label: "Fundo (conversão)", type: "textarea", rows: 2, placeholder: "Oferta, CTA, momento de compra" },
        ],
      },
      {
        id: "ferramentas",
        title: "Ferramentas e implementação",
        fields: [
          { id: "tools", label: "Stack do funil", type: "textarea", rows: 2, placeholder: "Landing page, e-mail, CRM, anúncios, WhatsApp..." },
          { id: "automations", label: "Automações por etapa", type: "textarea", rows: 3 },
          { id: "metrics", label: "Métricas por etapa", type: "textarea", rows: 2, placeholder: "Taxa de conversão topo→meio, CAC, LTV..." },
          { id: "status_impl", label: "Status", type: "select", options: ["Mapeando", "Construindo", "Testando", "Ativo", "Otimizando"] },
        ],
      },
    ],
  },

  // ── CONTEÚDO E MARKETING ──────────────────────────────────────────────────

  conteudo: {
    title: "Conteúdo",
    subtitle: "Produzir peça de conteúdo para o cliente",
    accent: "#F59E0B",
    context: "Entregável: peça de conteúdo sendo produzida. Desde briefing até publicação.",
    aiPrompt: "Produza esta peça de conteúdo para o cliente com base no contexto disponível: hook, desenvolvimento, CTA, distribuição.",
    sections: [
      {
        id: "briefing",
        title: "Briefing da peça",
        fields: [
          { id: "format", label: "Formato", type: "select", options: ["Post feed", "Carrossel Instagram", "Reels/Short", "Artigo blog", "Newsletter", "Vídeo longo", "Podcast", "Thread X", "Post LinkedIn"] },
          { id: "goal", label: "Objetivo desta peça", type: "text", placeholder: "atrair, engajar, vender, educar, posicionar..." },
          { id: "audience", label: "Para quem", type: "textarea", rows: 2 },
          { id: "pillar", label: "Pilar de conteúdo", type: "text" },
        ],
      },
      {
        id: "producao",
        title: "Produção",
        fields: [
          { id: "hook", label: "Hook / abertura", type: "textarea", rows: 2 },
          { id: "body", label: "Desenvolvimento / roteiro", type: "textarea", rows: 6 },
          { id: "cta", label: "CTA", type: "text" },
          { id: "visual_direction", label: "Direção visual / referência", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "publicacao",
        title: "Publicação",
        fields: [
          { id: "channel", label: "Canal de publicação", type: "text" },
          { id: "publish_date", label: "Data de publicação", type: "text" },
          { id: "status_impl", label: "Status", type: "select", options: ["Briefado", "Em produção", "Em revisão", "Aprovado", "Agendado", "Publicado"] },
        ],
      },
    ],
  },

  trafego: {
    title: "Tráfego pago",
    subtitle: "Estruturar e ativar campanhas para o cliente",
    accent: "#EF4444",
    context: "Entregável: campanhas de tráfego pago sendo estruturadas e ativadas no negócio do cliente.",
    aiPrompt: "Estruture as campanhas de tráfego do cliente: objetivo, plataformas, segmentações, orçamento, criativos e métricas.",
    sections: [
      {
        id: "estrategia",
        title: "Estratégia de campanha",
        fields: [
          { id: "goal", label: "Objetivo de negócio", type: "text", placeholder: "leads, vendas, cadastros, tráfego..." },
          { id: "platforms", label: "Plataformas", type: "text", placeholder: "Meta Ads, Google Ads, LinkedIn Ads, TikTok..." },
          { id: "budget", label: "Budget mensal", type: "text" },
          { id: "target_cpa", label: "CPA/CPL alvo", type: "text" },
        ],
      },
      {
        id: "configuracao",
        title: "Configuração e implementação",
        fields: [
          { id: "audiences", label: "Segmentações e públicos", type: "textarea", rows: 3 },
          { id: "creatives", label: "Criativos a produzir", type: "textarea", rows: 2 },
          { id: "tracking", label: "Tracking e pixels a configurar", type: "textarea", rows: 2 },
          { id: "status_impl", label: "Status", type: "select", options: ["Planejando", "Configurando", "Em revisão", "Ativo", "Otimizando", "Pausado"] },
        ],
      },
    ],
  },

  // ── RESULTADO E PROVA ─────────────────────────────────────────────────────

  resultado: {
    title: "Resultado / Output",
    subtitle: "Entregável principal saindo da engine",
    accent: "#10B981",
    context: "O output principal deste fluxo: o que foi produzido, como foi validado, critérios de aceite.",
    aiPrompt: "Documente este resultado: o que foi entregue, como foi validado, quais os próximos passos.",
    sections: [
      {
        id: "entrega",
        title: "O que foi entregue",
        fields: [
          { id: "deliverable", label: "Entregável (descrição do que foi feito)", type: "textarea", rows: 3 },
          { id: "link", label: "Link / acesso ao entregável", type: "text" },
          { id: "acceptance", label: "Como foi validado", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "proximo",
        title: "Próximos passos",
        fields: [
          { id: "next_steps", label: "O que acontece depois desse resultado", type: "textarea", rows: 3 },
          { id: "blockers", label: "Bloqueios ou dependências", type: "textarea", rows: 2 },
          { id: "status_impl", label: "Status", type: "select", options: ["Em produção", "Em revisão", "Aprovado pelo cliente", "Implantado", "Monitorando"] },
        ],
      },
    ],
  },

  decisao: {
    title: "Decisão / Aprovação",
    subtitle: "Ponto de aprovação ou bifurcação do fluxo",
    accent: "#F59E0B",
    context: "Checkpoint: define o que acontece a seguir com base em uma decisão ou aprovação.",
    aiPrompt: "Estruture este ponto de decisão: o que está sendo decidido, quem decide, critérios, opções possíveis.",
    sections: [
      {
        id: "decisao",
        title: "A decisão",
        fields: [
          { id: "question", label: "O que está sendo decidido", type: "textarea", rows: 2 },
          { id: "decision_maker", label: "Quem decide", type: "text" },
          { id: "criteria", label: "Critérios de decisão", type: "textarea", rows: 3 },
          { id: "options", label: "Opções possíveis", type: "textarea", rows: 3, placeholder: "Opção A: …\nOpção B: …" },
          { id: "chosen", label: "Decisão tomada", type: "text" },
          { id: "rationale", label: "Justificativa", type: "textarea", rows: 2 },
        ],
      },
    ],
  },

  metrica: {
    title: "Métrica",
    subtitle: "Instrumentar a medição do resultado",
    accent: "#F472B6",
    context: "Entregável: configuração de uma métrica para acompanhar o impacto do trabalho realizado.",
    aiPrompt: "Configure esta métrica: fórmula exata, fonte dos dados, baseline atual, target, frequência de medição.",
    sections: [
      {
        id: "definicao",
        title: "Definição da métrica",
        fields: [
          { id: "name", label: "Nome da métrica", type: "text" },
          { id: "formula", label: "Fórmula", type: "textarea", rows: 2, placeholder: "ex: Taxa de conversão = Vendas / Visitantes × 100" },
          { id: "source", label: "Fonte dos dados", type: "text", placeholder: "GA4, CRM, planilha, dashboard..." },
          { id: "frequency", label: "Frequência de medição", type: "select", options: ["Diária", "Semanal", "Mensal", "Por campanha"] },
        ],
      },
      {
        id: "baseline_target",
        title: "Baseline e target",
        fields: [
          { id: "baseline", label: "Baseline atual (antes da intervenção)", type: "text" },
          { id: "target_30d", label: "Target em 30 dias", type: "text" },
          { id: "target_90d", label: "Target em 90 dias", type: "text" },
          { id: "current", label: "Resultado atual", type: "text" },
        ],
      },
    ],
  },

  before_after: {
    title: "Before / After",
    subtitle: "Registrar evidência visual de antes e depois",
    accent: "#A78BFA",
    context: "Entregável: documentação da transformação realizada. Comprova o impacto do trabalho.",
    aiPrompt: "Estruture o before/after: estado inicial com números, intervenções realizadas, estado atual com números, impacto medido.",
    sections: [
      {
        id: "before",
        title: "Antes (estado inicial)",
        fields: [
          { id: "before_state", label: "Como era antes", type: "textarea", rows: 3 },
          { id: "before_numbers", label: "Números do antes", type: "textarea", rows: 2, placeholder: "KPIs com valores iniciais" },
          { id: "before_date", label: "Data do antes", type: "text" },
        ],
      },
      {
        id: "after",
        title: "Depois (estado atual)",
        fields: [
          { id: "interventions", label: "O que foi feito (intervenções)", type: "textarea", rows: 3 },
          { id: "after_state", label: "Como está agora", type: "textarea", rows: 3 },
          { id: "after_numbers", label: "Números do depois", type: "textarea", rows: 2 },
          { id: "after_date", label: "Data do depois", type: "text" },
        ],
      },
    ],
  },

  case: {
    title: "Case de sucesso",
    subtitle: "Documentar o resultado para uso comercial",
    accent: "#FBBF24",
    context: "Entregável final da esteira: documentação do impacto gerado, no formato PASTA, para uso comercial e replicação.",
    aiPrompt: "Monte o case PASTA com os dados disponíveis: Problema que o cliente tinha, Ação tomada, Solução implementada, Tração (com números reais), Aprendizados.",
    sections: [
      {
        id: "identificacao",
        title: "Identificação do case",
        fields: [
          { id: "client_profile", label: "Perfil do cliente (sem nome se sigiloso)", type: "text", placeholder: "E-commerce de moda, 5 anos, faturamento 200k/mês" },
          { id: "period", label: "Período do projeto", type: "text" },
          { id: "headline", label: "Manchete do case", type: "text", placeholder: "Aumentou X% em Y meses com Z" },
        ],
      },
      {
        id: "pasta",
        title: "Estrutura P.A.S.T.A",
        description: "Problema → Ação → Solução → Tração → Aprendizado",
        fields: [
          { id: "problema", label: "P — Problema", type: "textarea", rows: 3, placeholder: "Contexto inicial, dor específica, custo do problema" },
          { id: "acao", label: "A — Ação", type: "textarea", rows: 3, placeholder: "Diagnóstico feito, hipóteses levantadas, decisões tomadas" },
          { id: "solucao", label: "S — Solução", type: "textarea", rows: 3, placeholder: "O que foi construído e implementado" },
          { id: "tracao", label: "T — Tração", type: "textarea", rows: 3, placeholder: "Resultados com números: baseline → resultado atual" },
          { id: "aprendizado", label: "A — Aprendizado", type: "textarea", rows: 3, placeholder: "O que funcionou, o que não funcionou, o que repetiria" },
        ],
      },
    ],
  },

  // ── DEFAULT ──────────────────────────────────────────────────────────────

  objetivo: {
    title: "Objetivo",
    subtitle: "Definir e acompanhar um objetivo do cliente",
    accent: "#00FF88",
    context: "Define um objetivo claro com critérios mensuráveis. Base para priorização e tomada de decisão.",
    aiPrompt: "Defina este objetivo no formato SMART com os resultados-chave (OKR).",
    sections: [
      {
        id: "objetivo",
        title: "Definição do objetivo",
        fields: [
          { id: "statement", label: "Objetivo (verbo + resultado + prazo)", type: "textarea", rows: 2 },
          { id: "krs", label: "Resultados-chave mensuráveis", type: "textarea", rows: 4, placeholder: "KR1: atingir X até data\nKR2: reduzir Y em Z%\nKR3: entregar W" },
          { id: "priority", label: "Prioridade (1-5)", type: "select", options: ["1 - Crítico", "2 - Alto", "3 - Médio", "4 - Baixo", "5 - Pode esperar"] },
          { id: "owner", label: "Responsável", type: "text" },
        ],
      },
    ],
  },
};

// Default para kinds sem config específica
const DEFAULT_CONFIG: KindConfig = {
  title: "Node",
  subtitle: "Entregável operacional",
  accent: "#00FF88",
  context: "Documente o que precisa ser construído, como fazer e o critério de aceite.",
  aiPrompt: "Com base no contexto do workspace, preencha este entregável: o que precisa ser feito, como fazer, prazo e critério de aceite.",
  sections: [
    {
      id: "descricao",
      title: "O que construir",
      fields: [
        { id: "description", label: "Descrição do entregável", type: "textarea", rows: 3 },
        { id: "how", label: "Como fazer", type: "textarea", rows: 3 },
        { id: "acceptance", label: "Critério de aceite", type: "textarea", rows: 2 },
      ],
    },
    {
      id: "execucao",
      title: "Execução",
      fields: [
        { id: "owner", label: "Responsável", type: "text" },
        { id: "deadline", label: "Prazo", type: "text" },
        { id: "notes", label: "Notas", type: "textarea", rows: 3 },
        { id: "status_impl", label: "Status", type: "select", options: ["Planejado", "Em andamento", "Em revisão", "Concluído"] },
      ],
    },
  ],
};

// ─── Universal sections ─────────────────────────────────────
// Aplicadas a todo node (prepended para "Atribuição" e appended para "Operação").
// Persistem em data.fields como qualquer outro campo.
const UNIVERSAL_PRE_SECTION: SectionDef = {
  id: "atribuicao",
  title: "Atribuição",
  fields: [
    {
      id: "responsible",
      label: "Responsável",
      type: "select",
      options: ["Estratégia", "Design", "Tráfego", "Automação", "Conteúdo", "Dev", "IA/OpenClaw", "Cliente"],
    },
    {
      id: "priority",
      label: "Prioridade",
      type: "select",
      options: ["Crítica", "Alta", "Média", "Baixa"],
    },
    { id: "due_date", label: "Prazo", type: "text", placeholder: "Ex: 05/05/2026" },
  ],
};

const UNIVERSAL_POST_SECTION: SectionDef = {
  id: "operacao",
  title: "Plano de execução",
  description: "Como executar, validar e operar este node.",
  fields: [
    {
      id: "execution_plan",
      label: "Plano de execução",
      type: "textarea",
      rows: 4,
      placeholder: "O que fazer, como fazer, ferramentas necessárias, saída esperada...",
    },
    {
      id: "acceptance_criteria",
      label: "Critérios de aprovação",
      type: "textarea",
      rows: 2,
      placeholder: "Quando este node pode ser marcado como concluído?",
    },
    {
      id: "ai_prompt",
      label: "Prompt recomendado (IA)",
      type: "textarea",
      rows: 3,
      placeholder: "Prompt para usar com ChatGPT, Gemini ou Claude...",
    },
    {
      id: "openclaw_prompt",
      label: "Prompt para OpenClaw",
      type: "textarea",
      rows: 3,
      placeholder: "Instrução para o OpenClaw executar esta etapa...",
    },
  ],
};

const UNIVERSAL_NOTES_SECTION: SectionDef = {
  id: "notas",
  title: "Notas",
  fields: [
    {
      id: "notes",
      label: "Notas e observações",
      type: "textarea",
      rows: 4,
      placeholder: "Notas internas, bloqueios, decisões, observações da execução...",
    },
    {
      id: "blockers",
      label: "Bloqueios",
      type: "textarea",
      rows: 2,
      placeholder: "O que está impedindo este node de avançar...",
    },
  ],
};

const UNIVERSAL_RESOURCES_SECTION: SectionDef = {
  id: "resources",
  title: "Links e Recursos",
  fields: [
    {
      id: "links",
      label: "Links úteis",
      type: "textarea",
      rows: 3,
      placeholder: "Um link por linha: URL — descrição\nhttps://... — Briefing do site\nhttps://... — Pasta do Drive",
    },
    {
      id: "reference_docs",
      label: "Documentos de referência",
      type: "textarea",
      rows: 2,
      placeholder: "Nomes dos documentos relevantes para este node...",
    },
  ],
};

const METRICS_SECTION: SectionDef = {
  id: "metrics",
  title: "Métricas",
  fields: [
    { id: "metric_target", label: "Meta / KPI alvo", type: "text", placeholder: "Ex: CTR > 2%, CPA < R$30, 100 leads/mês" },
    { id: "metric_current", label: "Valor atual", type: "text", placeholder: "Ex: CTR 1.2%, CPA R$45, 32 leads" },
    { id: "metric_notes", label: "Observações de performance", type: "textarea", rows: 2, placeholder: "Tendências, comparações, insights..." },
  ],
};

const VAULT_KINDS = new Set<string>([
  "acessos", "automacao", "ia", "integracao", "site", "landing_page",
  "trafego", "crm", "email_mkt", "social",
]);

const METRICS_KINDS = new Set<string>([
  "metrica", "trafego", "landing_page", "site", "conteudo",
  "email_mkt", "social", "automacao", "crm", "funil",
]);

function withUniversalSections(cfg: KindConfig, kind: string | null): KindConfig {
  const sections: SectionDef[] = [UNIVERSAL_PRE_SECTION, ...cfg.sections, UNIVERSAL_POST_SECTION];
  if (kind && METRICS_KINDS.has(kind)) sections.push(METRICS_SECTION);
  sections.push(UNIVERSAL_NOTES_SECTION, UNIVERSAL_RESOURCES_SECTION);
  return { ...cfg, sections };
}

// ─── Main Component ──────────────────────────────────────────

export default function OperationalNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName,
  onDelete, onUpdated, onOpenChat,
}: Props) {
  const kind = resolveProjectNodeKind({ nodeType: node.node_type, data: node.data }) as ProjectNodeKind | null;
  const baseConfig = (kind && KIND_CONFIGS[kind]) || DEFAULT_CONFIG;
  const config = withUniversalSections(baseConfig, kind);
  const meta = kind ? getProjectTypeMeta(kind) : null;
  const needsVault = !!kind && VAULT_KINDS.has(kind);

  const [title, setTitle] = useState(node.title);
  const [status, setStatus] = useState(node.status ?? "active");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [vaultItems, setVaultItems] = useState<Array<{ id: string; service_name: string; label: string | null; category: string; login_url: string | null }>>([]);

  useEffect(() => {
    if (!needsVault || !clientId) { setVaultItems([]); return; }
    let cancelled = false;
    supabase
      .from("client_credentials")
      .select("id, service_name, label, category, login_url")
      .eq("client_id", clientId)
      .order("service_name")
      .then(({ data }) => {
        if (!cancelled && data) setVaultItems(data as typeof vaultItems);
      });
    return () => { cancelled = true; };
  }, [needsVault, clientId]);

  useEffect(() => {
    const data = (node.data as Record<string, unknown> | null) ?? {};
    const existing = (data.fields as Record<string, string> | undefined) ?? {};
    setValues(existing);
    setTitle(node.title);
    setStatus(node.status ?? "active");
  }, [node]);

  const setField = useCallback((key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    const currentData = (node.data as Record<string, unknown> | null) ?? {};
    // Persiste também description na coluna canvas_nodes.description
    // priorizando o campo "description" do form, com fallback para fullDescription
    // ou o valor antigo do node (não sobrescreve com null).
    const nextDescription =
      (typeof values.description === "string" && values.description.trim().length > 0
        ? values.description
        : null) ??
      (typeof values.fullDescription === "string" && values.fullDescription.trim().length > 0
        ? values.fullDescription
        : null) ??
      node.description ??
      null;
    const { error } = await supabase
      .from("canvas_nodes")
      .update({
        title,
        description: nextDescription,
        status,
        data: { ...currentData, fields: values, lastEditedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", node.id);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    syncNodeCompletedWhenDone({
      previousStatus: node.status,
      nextStatus: status,
      workspaceId,
      clientId,
      nodeId: node.id,
      nodeTitle: title,
    });
    toast({ title: "Salvo", description: `${config.title} atualizado.` });
    await onUpdated?.();
  }, [node.id, node.data, node.status, node.description, workspaceId, clientId, title, status, values, config.title, onUpdated]);

  const prefillWithAI = useCallback(async () => {
    setPrefilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("prefill-node", {
        body: {
          nodeId: node.id,
          workspaceId,
          clientId,
          kind,
          nodeType: kind,
          currentTitle: title,
          currentData: values,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error + (data.detail ? ` — ${data.detail}` : ""));
      if (data?.fields) {
        const merged: Record<string, string> = { ...values };
        Object.entries(data.fields as Record<string, string>).forEach(([k, v]) => {
          if (v && typeof v === "string") merged[k] = v;
        });
        setValues(merged);
        toast({ title: "Preenchido com IA ✦", description: "Revise os campos e salve quando estiver bom." });
      }
    } catch (err) {
      toast({
        title: "Falha no preenchimento",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally { setPrefilling(false); }
  }, [node.id, workspaceId, clientId, kind, title, values]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border border-white/10 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden sm:rounded-2xl"
        style={{
          background: "rgba(9,17,10,0.92)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 32px 72px rgba(0,0,0,0.75)",
        }}
      >
        <DialogTitle className="sr-only">{title || "Editar node"}</DialogTitle>

        {/* Header — pr-12 to leave room for built-in X */}
        <div className="px-5 pt-5 pb-3 border-b shrink-0 pr-12" style={{ borderColor: `${config.accent}20`, background: `linear-gradient(135deg, ${config.accent}08, transparent)` }}>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 mt-0.5" style={{ background: `${config.accent}15`, border: `1px solid ${config.accent}40`, color: config.accent }}>
              {meta?.icon ? <meta.icon className="h-4 w-4" /> : <Workflow className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: config.accent }}>{config.title}</span>
              </div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-[15px] font-semibold bg-transparent border-0 px-0 focus-visible:ring-0 text-foreground" />
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{config.context}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Button onClick={prefillWithAI} disabled={prefilling} size="sm" className="h-7 gap-1.5 text-[11px] font-medium" style={{ background: `${config.accent}18`, color: config.accent, border: `1px solid ${config.accent}40` }}>
              {prefilling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Gerar com IA
            </Button>
            {onOpenChat && (
              <Button onClick={() => { onOpenChange(false); onOpenChat(node.id); }} size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]">
                <MessageCircle className="h-3 w-3" />
                Chat
              </Button>
            )}
            <div className="flex-1" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[["draft","Rascunho"],["active","Ativo"],["blocked","Bloqueado"],["done","Concluído"]].map(([v,l]) => (
                  <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Sections */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="px-5 py-4 space-y-6">
            {config.sections.map((section) => (
              <section key={section.id}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1" style={{ background: `${config.accent}20` }} />
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: config.accent }}>{section.title}</h3>
                  <div className="h-px flex-1" style={{ background: `${config.accent}20` }} />
                </div>
                {section.description && <p className="text-[11px] text-muted-foreground mb-3 -mt-1">{section.description}</p>}
                <div className="space-y-3">
                  {section.fields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label className="text-xs text-foreground/70 font-medium">{field.label}</Label>
                      {field.type === "textarea" ? (
                        <Textarea value={values[field.id] ?? ""} onChange={(e) => setField(field.id, e.target.value)} placeholder={field.placeholder ?? field.hint} rows={field.rows ?? 3} className="text-xs bg-background/50 resize-none" />
                      ) : field.type === "select" ? (
                        <Select value={values[field.id] ?? ""} onValueChange={(v) => setField(field.id, v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                          <SelectContent>{(field.options ?? []).map((opt) => <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input value={values[field.id] ?? ""} onChange={(e) => setField(field.id, e.target.value)} placeholder={field.placeholder ?? field.hint} className="h-8 text-xs" />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* Cofre de Acessos — somente para kinds relevantes */}
            {needsVault && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1" style={{ background: `${config.accent}20` }} />
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1.5" style={{ color: config.accent }}>
                    <KeyRound className="h-3 w-3" />
                    Cofre de Acessos
                  </h3>
                  <div className="h-px flex-1" style={{ background: `${config.accent}20` }} />
                </div>
                {vaultItems.length > 0 ? (
                  <div className="space-y-1.5">
                    {vaultItems.map((v) => (
                      <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-background/40 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{v.service_name}</div>
                          {v.label && <div className="text-[10px] text-muted-foreground truncate">{v.label}</div>}
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/30 shrink-0">{v.category}</span>
                        {v.login_url && (
                          <a href={v.login_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5 shrink-0">
                            Abrir <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">Nenhum acesso cadastrado no cofre deste cliente.</p>
                )}
              </section>
            )}

            {/* Histórico */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1" style={{ background: `${config.accent}20` }} />
                <h3 className="text-[10px] font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1.5" style={{ color: config.accent }}>
                  <History className="h-3 w-3" />
                  Histórico
                </h3>
                <div className="h-px flex-1" style={{ background: `${config.accent}20` }} />
              </div>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <p>Criado em {new Date(node.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                {node.updated_at && node.updated_at !== node.created_at && (
                  <p>
                    Última edição:{" "}
                    {new Date(node.updated_at).toLocaleDateString("pt-BR", {
                      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                )}
                {values.responsible && <p>Responsável: {values.responsible}</p>}
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/40 flex items-center gap-2 bg-background/30 shrink-0">
          <Button variant="ghost" size="sm" onClick={async () => { if (!onDelete || !window.confirm(`Excluir "${title}"?`)) return; await onDelete(node.id); onOpenChange(false); }} disabled={!onDelete} className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3 w-3 mr-1.5" />
            Excluir
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">Fechar</Button>
          <Button onClick={save} disabled={saving} size="sm" className="h-8 text-xs gap-1.5" style={{ background: config.accent, color: "#09110A", fontWeight: 600 }}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
