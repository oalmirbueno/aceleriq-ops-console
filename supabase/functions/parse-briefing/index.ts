import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DOSSIER_BLOCKS = [
  "identity",
  "offer",
  "commercial",
  "operational",
  "digital",
  "access",
  "diagnostic",
  "decisions",
];

const systemPrompt = `Você é um analista operacional da Aceleriq. Sua tarefa é ler o conteúdo de um briefing preenchido por um cliente e extrair as informações organizadas em seções estruturadas.

Para cada informação relevante encontrada, crie uma seção com:
- title: título curto e descritivo (máx 80 chars)
- content: conteúdo completo extraído, preservando detalhes importantes
- dossier_block: o bloco do dossiê operacional onde essa informação se encaixa. Use APENAS um destes valores:
  - "identity" — nome, segmento, história, posicionamento, marca, identidade visual
  - "offer" — produto, serviço, ICP, público-alvo, persona, proposta de valor
  - "commercial" — modelo de vendas, ticket, concorrentes, orçamento, faturamento
  - "operational" — equipe, processos internos, ferramentas de gestão, prazos
  - "digital" — site, redes sociais, tráfego, SEO, integrações, ferramentas digitais
  - "access" — acessos, logins, credenciais, domínio, hospedagem
  - "diagnostic" — dores, problemas, gargalos, desafios, diagnóstico
  - "decisions" — objetivos, metas, decisões tomadas, prioridades, expectativas

Regras:
- Extraia TODAS as informações relevantes, não resuma demais
- Preserve detalhes específicos (números, nomes, URLs, datas)
- Se uma informação se encaixa em mais de um bloco, escolha o mais relevante
- Não invente informações que não estão no texto
- Agrupe informações relacionadas na mesma seção quando fizer sentido
- Mínimo de 3 seções, máximo de 15
- Responda APENAS com o JSON, sem markdown ou explicações`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, briefing_type } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Texto do briefing muito curto ou ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const briefingLabel = briefing_type === "sitebolt" ? "Briefing SiteBolt" : "Briefing Essencial";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Tipo de briefing: ${briefingLabel}\n\nConteúdo do briefing:\n\n${text}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "structure_briefing",
              description: "Retorna as seções estruturadas extraídas do briefing",
              parameters: {
                type: "object",
                properties: {
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Título curto da seção (máx 80 chars)" },
                        content: { type: "string", description: "Conteúdo completo extraído" },
                        dossier_block: {
                          type: "string",
                          enum: DOSSIER_BLOCKS,
                          description: "Bloco do dossiê operacional",
                        },
                      },
                      required: ["title", "content", "dossier_block"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["sections"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "structure_briefing" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos em Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar briefing com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "IA não retornou dados estruturados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    // Validate sections
    const sections = (parsed.sections || [])
      .filter(
        (s: any) =>
          s.title && typeof s.title === "string" &&
          s.content && typeof s.content === "string" &&
          DOSSIER_BLOCKS.includes(s.dossier_block)
      )
      .map((s: any) => ({
        title: s.title.slice(0, 80),
        content: s.content,
        dossier_block: s.dossier_block,
      }));

    return new Response(JSON.stringify({ sections }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-briefing error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
