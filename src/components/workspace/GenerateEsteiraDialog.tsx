import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Check } from "lucide-react";
import { ESTEIRA_TEMPLATES, type EsteiraTemplate, getEsteiraTemplateForPlan } from "./esteiraTemplates";
import { supabase } from "@/integrations/supabase/client";
import EsteiraTemplatePreview from "./EsteiraTemplatePreview";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Cliente (real) cujo plan_name será usado como sugestão default */
  clientId: string;
  /** Confirma a geração com o template escolhido */
  onConfirm: (template: EsteiraTemplate) => Promise<void> | void;
  generating?: boolean;
}

export default function GenerateEsteiraDialog({
  open, onOpenChange, clientId, onConfirm, generating = false,
}: Props) {
  const [planName, setPlanName] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("growth");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("plan_name")
        .eq("id", clientId)
        .maybeSingle();
      if (!alive) return;
      const plan = (data?.plan_name as string | null) ?? null;
      setPlanName(plan);
      const recommended = getEsteiraTemplateForPlan(plan);
      setSelectedKey(recommended.key);
    })();
    return () => { alive = false; };
  }, [open, clientId]);

  const handleConfirm = async () => {
    const tpl = ESTEIRA_TEMPLATES.find((t) => t.key === selectedKey);
    if (!tpl) return;
    await onConfirm(tpl);
  };

  const recommended = getEsteiraTemplateForPlan(planName).key;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Gerar esteira de produção
          </DialogTitle>
          <DialogDescription className="text-xs">
            Escolha o template conforme o que vendemos e entregamos. A esteira inteira é
            criada com nodes posicionados pelas etapas ACELERA e conexões pré-feitas.
            {planName && (
              <span className="ml-1">
                Plano detectado: <strong className="text-foreground capitalize">{planName}</strong>.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {ESTEIRA_TEMPLATES.map((tpl) => {
              const active = tpl.key === selectedKey;
              const isRecommended = tpl.key === recommended;
              return (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => setSelectedKey(tpl.key)}
                  disabled={generating}
                  className={`text-left rounded-lg border-2 p-3 transition-all ${
                    active
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-card/40 hover:border-primary/40 hover:bg-muted/30"
                  } ${generating ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{tpl.label}</p>
                        {isRecommended && (
                          <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                            Recomendado
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{tpl.tagline}</p>
                    </div>
                    {active && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mb-2">
                    <Badge variant="outline" className="text-[9px]">
                      {tpl.nodes.length} node{tpl.nodes.length === 1 ? "" : "s"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">
                      {tpl.edges.length} conexõe{tpl.edges.length === 1 ? "" : "s"}
                    </Badge>
                  </div>

                  {/* Mini-diagram preview: nodes positioned by stage with arrows */}
                  <EsteiraTemplatePreview template={tpl} active={active} />
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            O briefing geralmente vem da SiteBolt — o node fica como ponto de entrada.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={generating}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={generating}>
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              Gerar esteira
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
