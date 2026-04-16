import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── Constantes do provider ─── */
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const PROVIDER_TIMEOUT_MS = 45_000;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Extract and validate JWT from Authorization header.
 * Returns the authenticated user ID or a Response error.
 */
async function requireAuth(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Autenticação obrigatória", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return jsonError("Token inválido ou expirado", 401);
  }

  return { userId: data.user.id };
}

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
- Responda APENAS com JSON válido no formato:
{ "sections": [ { "title": "...", "content": "...", "dossier_block": "..." } ] }
- Não envolva o JSON em markdown, code fences ou texto adicional`;

/** Saneia possíveis cercas markdown e texto extra antes do JSON. */
function sanitizeJsonPayload(raw: string): string {
  let s = raw.trim();
  // Remove ```json ... ``` ou ``` ... ```
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  // Recorta do primeiro { até o último } se ainda houver lixo ao redor
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first > 0 || (last !== -1 && last < s.length - 1)) {
    if (first !== -1 && last !== -1 && last > first) {
      s = s.slice(first, last + 1);
    }
  }
  return s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth gate (obrigatória — sem fallback) ──
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;

  try {
    const { text, briefing_type } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return jsonError("Texto do briefing muito curto ou ausente", 400);
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("[parse-briefing] GEMINI_API_KEY não configurada no ambiente");
      return jsonError("Serviço de IA indisponível no momento", 500);
    }

    const briefingLabel = briefing_type === "sitebolt" ? "Briefing SiteBolt" : "Briefing Essencial";

    const userPrompt = `Tipo de briefing: ${briefingLabel}\n\nConteúdo do briefing:\n\n${text}`;

    // Gemini REST: systemInstruction + contents + generationConfig com response_mime_type
    const geminiBody = {
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: "application/json",
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const aborted = (err as Error)?.name === "AbortError";
      console.error("[parse-briefing] provider fetch error:", err);
      return jsonError(
        aborted ? "Tempo de resposta da IA excedido" : "Falha ao contatar serviço de IA",
        aborted ? 504 : 502,
      );
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[parse-briefing] Gemini error:", response.status, errText);
      if (response.status === 429) {
        return jsonError("Limite de requisições excedido. Tente novamente em alguns segundos.", 429);
      }
      if (response.status >= 500) {
        return jsonError("Serviço de IA temporariamente indisponível", 502);
      }
      return jsonError("Erro ao processar briefing com IA", 500);
    }

    const data = await response.json().catch((e) => {
      console.error("[parse-briefing] Falha ao decodificar resposta do provider:", e);
      return null;
    });

    const rawText: string | undefined = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? "")
      .join("")
      .trim();

    if (!rawText) {
      console.error("[parse-briefing] Resposta vazia do provider:", JSON.stringify(data));
      return jsonError("IA não retornou dados estruturados", 502);
    }

    let parsed: { sections?: unknown };
    try {
      parsed = JSON.parse(sanitizeJsonPayload(rawText));
    } catch (e) {
      console.error("[parse-briefing] JSON inválido do provider:", e, rawText.slice(0, 500));
      return jsonError("Resposta da IA em formato inválido", 502);
    }

    const rawSections = Array.isArray(parsed?.sections) ? parsed.sections : [];
    const sections = rawSections
      .filter(
        (s: any) =>
          s &&
          typeof s.title === "string" &&
          s.title.trim().length > 0 &&
          typeof s.content === "string" &&
          s.content.trim().length > 0 &&
          typeof s.dossier_block === "string" &&
          DOSSIER_BLOCKS.includes(s.dossier_block),
      )
      .map((s: any) => ({
        title: s.title.trim().slice(0, 80),
        content: s.content.trim(),
        dossier_block: s.dossier_block,
      }));

    return new Response(JSON.stringify({ sections }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[parse-briefing] erro interno:", e);
    return jsonError("Erro interno", 500);
  }
});
