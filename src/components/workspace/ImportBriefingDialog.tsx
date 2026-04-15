import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { BriefingType } from "./aceleraConstants";

/* ─── Template definitions ─── */

interface BriefingField {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  /** Which dossier block this field maps to — only set when mapping is explicit and safe */
  dossierBlock?: string;
}

const ESSENTIAL_FIELDS: BriefingField[] = [
  { key: "company_overview", label: "Visão geral da empresa", placeholder: "Segmento, tempo de mercado, porte…", multiline: true, dossierBlock: "identity" },
  { key: "main_product", label: "Produto / Serviço principal", placeholder: "Descreva o que a empresa vende…", multiline: true, dossierBlock: "offer" },
  { key: "target_audience", label: "Público-alvo / ICP", placeholder: "Quem é o cliente ideal…", multiline: true, dossierBlock: "offer" },
  { key: "main_goals", label: "Objetivos principais", placeholder: "O que a empresa quer alcançar…", multiline: true },
  { key: "pain_points", label: "Dores e desafios", placeholder: "Principais problemas enfrentados…", multiline: true, dossierBlock: "diagnostic" },
  { key: "current_digital", label: "Presença digital atual", placeholder: "Site, redes sociais, ferramentas…", multiline: true, dossierBlock: "digital" },
  { key: "competitors", label: "Concorrentes conhecidos", placeholder: "Principais concorrentes…" },
  { key: "budget_range", label: "Faixa de investimento", placeholder: "Quanto pretende investir…" },
  { key: "additional_notes", label: "Observações adicionais", placeholder: "Qualquer informação relevante…", multiline: true },
];

const SITEBOLT_FIELDS: BriefingField[] = [
  { key: "site_type", label: "Tipo de site", placeholder: "Institucional, e-commerce, landing page…", dossierBlock: "digital" },
  { key: "pages_needed", label: "Páginas desejadas", placeholder: "Home, Sobre, Serviços, Contato…", dossierBlock: "digital" },
  { key: "reference_sites", label: "Sites de referência", placeholder: "URLs de sites que gosta…", multiline: true },
  { key: "brand_identity", label: "Identidade visual", placeholder: "Cores, fontes, logo — o que já existe…", dossierBlock: "identity" },
  { key: "content_status", label: "Status do conteúdo", placeholder: "Textos e imagens prontos? Precisa produzir?" },
  { key: "domain_hosting", label: "Domínio e hospedagem", placeholder: "Já possui domínio? Qual provedor?", dossierBlock: "access" },
  { key: "integrations", label: "Integrações necessárias", placeholder: "WhatsApp, analytics, CRM, pagamento…", dossierBlock: "digital" },
  { key: "seo_goals", label: "Objetivos de SEO", placeholder: "Palavras-chave, posicionamento…" },
  { key: "deadline", label: "Prazo desejado", placeholder: "Data ou prazo esperado…" },
  { key: "additional_notes", label: "Observações adicionais", placeholder: "Qualquer informação relevante…", multiline: true },
];

const BRIEFING_CONFIGS: Record<"essential" | "sitebolt", { label: string; fields: BriefingField[] }> = {
  essential: { label: "Briefing Essencial", fields: ESSENTIAL_FIELDS },
  sitebolt: { label: "Briefing SiteBolt", fields: SITEBOLT_FIELDS },
};

/* ─── Component ─── */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  briefingType: "essential" | "sitebolt";
  onImported: () => void;
}

interface PreviewEntry {
  title: string;
  content: string;
  dossierBlock?: string;
  included: boolean;
}

export default function ImportBriefingDialog({ open, onOpenChange, workspaceId, clientId, briefingType, onImported }: Props) {
  const config = BRIEFING_CONFIGS[briefingType];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"fill" | "preview">("fill");
  const [preview, setPreview] = useState<PreviewEntry[]>([]);

  const reset = () => {
    setValues({});
    setSaving(false);
    setStep("fill");
    setPreview([]);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const filledFields = config.fields.filter((f) => values[f.key]?.trim());
  const hasContent = filledFields.length > 0;

  const buildPreview = () => {
    const entries: PreviewEntry[] = filledFields.map((f) => ({
      title: f.label,
      content: values[f.key].trim(),
      dossierBlock: f.dossierBlock,
      included: true,
    }));
    setPreview(entries);
    setStep("preview");
  };

  const toggleEntry = (i: number) => {
    setPreview((prev) => prev.map((e, idx) => idx === i ? { ...e, included: !e.included } : e));
  };

  const handleImport = async () => {
    const toImport = preview.filter((e) => e.included);
    if (toImport.length === 0) {
      toast({ title: "Nenhum item selecionado", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const rows = toImport.map((e) => {
        const metadata: Record<string, unknown> = {
          briefing_kind: briefingType as BriefingType,
          import_source: `briefing_${briefingType}`,
          generated_from: "briefing_import",
        };
        if (e.dossierBlock) {
          metadata.dossier_block = e.dossierBlock;
        }
        return {
          workspace_id: workspaceId,
          client_id: clientId,
          context_type: "briefing",
          title: `[${config.label}] ${e.title}`,
          content: e.content,
          source_label: config.label,
          is_key_decision: false,
          tags: ["briefing", briefingType],
          metadata,
        };
      });

      const { error } = await supabase.from("context_entries").insert(rows);
      if (error) {
        toast({ title: "Erro ao importar briefing", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      // Timeline — single aggregated event
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "context_added",
        title: `${config.label} importado`,
        description: `${toImport.length} item(ns) importado(s) do ${config.label}`,
        happened_at: new Date().toISOString(),
      });

      toast({ title: `${config.label} importado`, description: `${toImport.length} item(ns) criado(s)` });
      onImported();
      handleOpenChange(false);
    } catch {
      /* toasted */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar {config.label}</DialogTitle>
          <DialogDescription>
            {step === "fill"
              ? "Preencha os campos disponíveis. Campos vazios serão ignorados."
              : "Revise os itens que serão importados. Remova o que não for necessário."}
          </DialogDescription>
        </DialogHeader>

        {step === "fill" && (
          <div className="space-y-4">
            {config.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs">{field.label}</Label>
                {field.multiline ? (
                  <Textarea
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    rows={3}
                  />
                ) : (
                  <Input
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              {preview.filter((e) => e.included).length} de {preview.length} item(ns) selecionado(s)
            </p>
            {preview.map((entry, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md border p-3 transition-opacity ${
                  entry.included ? "border-border" : "border-border/30 opacity-40"
                }`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{entry.title}</span>
                    {entry.dossierBlock && (
                      <Badge variant="outline" className="text-[9px]">Dossiê: {entry.dossierBlock}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{entry.content}</p>
                </div>
                <button
                  onClick={() => toggleEntry(i)}
                  className="shrink-0 text-muted-foreground hover:text-destructive mt-0.5"
                  title={entry.included ? "Remover" : "Incluir"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "preview" && (
            <Button variant="ghost" size="sm" onClick={() => setStep("fill")} disabled={saving}>
              Voltar
            </Button>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          {step === "fill" ? (
            <Button onClick={buildPreview} disabled={!hasContent}>
              Pré-visualizar ({filledFields.length})
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={saving || preview.filter((e) => e.included).length === 0}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importando...</> : "Importar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
