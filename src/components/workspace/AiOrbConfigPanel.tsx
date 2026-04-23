import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AiOrbType } from "./AiOrbNode";
import { AI_ORB_DEFINITIONS, type AiEngine, type AiOrbData } from "./aiOrbConstants";
import AiOrbGenerationLog from "./AiOrbGenerationLog";
import AiOrbMemoryPanel from "./AiOrbMemoryPanel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AiOrbData | null;
  onDataChange: (patch: Partial<AiOrbData>) => void;
  onGenerate: (deterministic?: boolean) => void;
  generating: boolean;
}

export default function AiOrbConfigPanel({ open, onOpenChange, data, onDataChange, onGenerate, generating }: Props) {
  if (!data) return null;
  const def = AI_ORB_DEFINITIONS[data.orbType as AiOrbType] ?? AI_ORB_DEFINITIONS.planner;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={`ai-orb-mini ai-orb-${data.orbType}`} />
            AI Orb · {def.label}
          </DialogTitle>
          <DialogDescription className="text-xs">{def.specialization}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <AiOrbGenerationLog data={data} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Motor</Label>
              <select
                value={data.aiEngine}
                onChange={(event) => onDataChange({ aiEngine: event.target.value as AiEngine })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground"
              >
                <option value="internal">IA Aceleriq</option>
                <option value="gpt_external">GPT externo</option>
                <option value="claude_api">Claude API</option>
                <option value="custom">Webhook custom</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Temperatura</Label>
              <Input type="number" min="0" max="1" step="0.1" value={data.temperature ?? 0.3} onChange={(event) => onDataChange({ temperature: Number(event.target.value) })} className="h-9 text-xs" />
            </div>
          </div>

          {data.aiEngine === "gpt_external" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Endpoint GPT externo</Label>
              <Input value={data.gptEndpoint ?? ""} onChange={(event) => onDataChange({ gptEndpoint: event.target.value })} placeholder="https://api.openai.com/v1/chat/completions" className="h-9 text-xs" />
            </div>
          )}
          {data.aiEngine === "custom" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Webhook custom</Label>
              <Input value={data.customWebhookUrl ?? ""} onChange={(event) => onDataChange({ customWebhookUrl: event.target.value })} placeholder="https://..." className="h-9 text-xs" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Instrução adicional</Label>
            <Textarea value={data.systemPrompt ?? ""} onChange={(event) => onDataChange({ systemPrompt: event.target.value })} placeholder="Override ou foco adicional para este Orb…" className="min-h-20 text-xs" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Memória</Label>
            <AiOrbMemoryPanel memory={data.memory ?? []} />
          </div>

          {data.lastError && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive-foreground">{data.lastError}</p>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => onGenerate(true)} disabled={generating}>
              Gerar sem IA
            </Button>
            <Button size="sm" onClick={() => onGenerate(false)} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Gerar {def.specialization}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}