/**
 * AiOrbConfigPanel v3 — painel de geração do AI Orb com:
 *   - Escolha de agente (10 agentes)
 *   - Escolha de modelo
 *   - Número de nodes
 *   - Instrução personalizada
 *   - Preview do contexto carregado
 *   - Loading com feedback do agente
 *   - Resultado rico com insights + rationale
 */
import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Sparkles, Brain, Wand2, Eye, Settings2, ChevronRight, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AGENT_LIST, getAgent, type AgentId } from "@/lib/aiAgents";
import type { AiOrbType } from "./AiOrbNode";
import { AI_ORB_DEFINITIONS, type AiOrbData } from "./aiOrbConstants";
import AiOrbGenerationLog from "./AiOrbGenerationLog";
import { cn } from "@/lib/utils";

// Mapeamento orbType → agente default
const ORB_DEFAULT_AGENT: Record<AiOrbType, AgentId> = {
  planner: "strategist",
  docs: "documentarian",
  content: "content_director",
  tech: "automation_architect",
  proof: "data_analyst",
  full: "strategist",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AiOrbData | null;
  onDataChange: (patch: Partial<AiOrbData>) => void;
  onGenerate: (options: { agentId: AgentId; customPrompt: string; targetNodes: number; model?: string }) => void;
  generating: boolean;
}

export default function AiOrbConfigPanel({ open, onOpenChange, data, onDataChange, onGenerate, generating }: Props) {
  const def = data ? (AI_ORB_DEFINITIONS[data.orbType as AiOrbType] ?? AI_ORB_DEFINITIONS.planner) : null;

  const [selectedAgent, setSelectedAgent] = useState<AgentId>(() =>
    data ? ORB_DEFAULT_AGENT[data.orbType as AiOrbType] ?? "strategist" : "strategist"
  );
  const [customPrompt, setCustomPrompt] = useState("");
  const [targetNodes, setTargetNodes] = useState(10);
  const [selectedModel, setSelectedModel] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const agent = useMemo(() => getAgent(selectedAgent), [selectedAgent]);
  const effectiveModel = selectedModel || agent.suggestedModel;

  // Reset ao abrir com orb diferente
  useEffect(() => {
    if (!open || !data) return;
    setSelectedAgent(ORB_DEFAULT_AGENT[data.orbType as AiOrbType] ?? "strategist");
    setCustomPrompt("");
    setTargetNodes(10);
    setSelectedModel("");
  }, [open, data?.orbType]);

  if (!data || !def) return null;

  const handleGenerate = () => {
    onGenerate({
      agentId: selectedAgent,
      customPrompt: customPrompt.trim(),
      targetNodes,
      model: selectedModel || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-3 border-b border-border shrink-0 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={`ai-orb-mini ai-orb-${data.orbType}`} />
            <span>{def.title}</span>
            <Badge variant="outline" className="text-[10px] ml-1">{data.orbType}</Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {def.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
          {/* ═══ ESCOLHA DO AGENTE ═══ */}
          <div>
            <Label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-primary" />
              Qual agente você quer usar?
            </Label>
            <div className="grid grid-cols-2 gap-1.5">
              {AGENT_LIST.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setSelectedAgent(a.id); setSelectedModel(""); }}
                  disabled={generating}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded-lg text-left transition-all",
                    selectedAgent === a.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-secondary/50 border border-transparent",
                    generating && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md shrink-0 text-base"
                    style={{ background: `${a.color}15`, border: `1px solid ${a.color}30` }}>
                    {a.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold" style={{ color: a.color }}>
                      {a.name}
                      {selectedAgent === a.id && <Check className="h-3 w-3 inline ml-1" />}
                    </p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                      {a.shortDesc}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ═══ INSTRUÇÃO ESPECÍFICA ═══ */}
          <div>
            <Label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Wand2 className="h-3 w-3 text-primary" />
              Instrução específica (opcional)
            </Label>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={`Ex: Foque em estratégia de marketing de afiliados, com ênfase em tráfego orgânico.\nDeixe em branco para gerar conforme o tipo de Orb.`}
              rows={3}
              className="text-sm resize-none"
              disabled={generating}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {agent.emoji} {agent.name} vai gerar com foco em: {def.title}
            </p>
          </div>

          {/* ═══ QUANTIDADE DE NODES ═══ */}
          <div>
            <Label className="text-xs font-semibold mb-2">Quantos nodes gerar?</Label>
            <div className="flex items-center gap-2">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTargetNodes(n)}
                  disabled={generating}
                  className={cn(
                    "h-8 px-4 rounded-md text-xs font-semibold transition-all",
                    targetNodes === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-foreground hover:bg-secondary",
                    generating && "opacity-50"
                  )}
                >
                  {n} nodes
                </button>
              ))}
            </div>
          </div>

          {/* ═══ CONFIGURAÇÃO AVANÇADA ═══ */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings2 className="h-3 w-3" />
              Configuração avançada
              <ChevronRight className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-90")} />
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-2 pl-4 border-l-2 border-border/50">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Modelo Gemini</Label>
                  <select
                    value={effectiveModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={generating}
                    className="w-full h-8 text-xs rounded-md border border-border bg-background px-2"
                  >
                    <optgroup label="⭐ Recomendado pelo agente">
                      <option value={agent.suggestedModel}>{agent.suggestedModel} (default)</option>
                    </optgroup>
                    <optgroup label="Flash (grátis)">
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
                    </optgroup>
                    <optgroup label="Pro (grátis limitado)">
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    </optgroup>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* ═══ PREVIEW DE CONTEXTO ═══ */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start gap-2">
              <Eye className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-primary">
                  Contexto completo será enviado
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                  Briefing essencial do cliente, todos os nodes do workspace, timeline, dossiê,
                  métricas capturadas e conexões entre nodes. O {agent.name} vai usar tudo para
                  gerar resultados específicos deste cliente, não genéricos.
                </p>
              </div>
            </div>
          </div>

          {/* ═══ ÚLTIMA GERAÇÃO (rationale + insights) ═══ */}
          {data.last_rationale && !generating && (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Última geração
              </p>
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {data.last_rationale}
              </p>
              {Array.isArray(data.last_insights) && data.last_insights.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                  {data.last_insights.slice(0, 5).map((insight, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <Sparkles className="h-2.5 w-2.5 text-primary shrink-0 mt-0.5" />
                      <span>{insight}</span>
                    </div>
                  ))}
                </div>
              )}
              {data.last_cost_usd !== undefined && (
                <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-3 text-[10px] text-muted-foreground">
                  {data.last_model && <span>{data.last_model}</span>}
                  {data.last_nodes_generated !== undefined && <span>{data.last_nodes_generated} nodes</span>}
                  {data.last_cost_usd !== undefined && data.last_cost_usd > 0 && (
                    <span>${data.last_cost_usd.toFixed(5)}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ LOG GERAÇÃO (componente existente) ═══ */}
          {generating && <AiOrbGenerationLog />}
        </div>

        {/* ═══ FOOTER — AÇÕES ═══ */}
        <div className="px-5 py-3 border-t border-border shrink-0 bg-card/50 flex items-center gap-2">
          <Button onClick={() => onOpenChange(false)} variant="ghost" size="sm" className="h-8 text-xs" disabled={generating}>
            Cancelar
          </Button>
          <div className="flex-1" />
          <div className="text-[10px] text-muted-foreground">
            {agent.emoji} {agent.name}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            size="sm"
            className="h-9 gap-1.5 text-xs"
            style={{ background: agent.color }}
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Gerando {targetNodes} nodes...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Gerar {targetNodes} nodes com {agent.name}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
