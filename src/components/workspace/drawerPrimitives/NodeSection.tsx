/**
 * NodeSection
 *
 * Renderiza uma section de blueprint com seus campos editáveis.
 * Cada campo tem badge de origem (auto/client/edited/empty/fallback)
 * e auto-salva via debounce no parent.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Bot, User, Pencil, AlertCircle, Sparkles, Paperclip } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import AttachmentUploader, { type AttachmentItem } from "../AttachmentUploader";
import type { NodeSection as NodeSectionType, SectionField } from "../nodeBlueprints";
import type { PrefillSectionContent, PrefillFieldValue, FieldOrigin } from "../nodePrefillTypes";

interface Props {
  section: NodeSectionType;
  content: PrefillSectionContent | undefined;
  onFieldChange: (fieldId: string, next: PrefillFieldValue) => void;
  disabled?: boolean;
  /** Necessário para uploads (bucket scope). Quando ausente, o campo de anexo fica desabilitado. */
  workspaceId?: string;
  nodeId?: string;
}

const ORIGIN_META: Record<FieldOrigin, { label: string; cls: string; tip: string; Icon: typeof Bot }> = {
  auto:     {
    label: "IA",
    cls: "border-primary/40 text-primary bg-primary/10",
    tip: "Rascunhado pela IA a partir do auto-contexto do workspace.",
    Icon: Bot,
  },
  client:   {
    label: "Cliente",
    cls: "border-foreground/30 text-foreground bg-foreground/5",
    tip: "Veio direto do cliente (briefing público preenchido).",
    Icon: User,
  },
  edited:   {
    label: "Editado",
    cls: "border-border text-foreground/80 bg-muted/30",
    tip: "Editado por você — sobrescreve o rascunho da IA.",
    Icon: Pencil,
  },
  empty:    {
    label: "A definir",
    cls: "border-dashed border-border text-muted-foreground bg-transparent",
    tip: "Decisão humana ou IA não encontrou evidência no contexto.",
    Icon: AlertCircle,
  },
  fallback: {
    label: "Manual",
    cls: "border-border text-muted-foreground bg-muted/10",
    tip: "Preenchido manualmente — IA estava indisponível.",
    Icon: Sparkles,
  },
};

export default function NodeSection({ section, content, onFieldChange, disabled, workspaceId, nodeId }: Props) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3.5 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
        {section.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{section.description}</p>
        )}
      </div>
      <div className="space-y-3">
        {section.fields.map((field) => (
          <FieldEditor
            key={field.id}
            field={field}
            value={content?.fields[field.id]}
            onChange={(next) => onFieldChange(field.id, next)}
            disabled={disabled}
            workspaceId={workspaceId}
            nodeId={nodeId}
          />
        ))}
      </div>
      {content?.ai_notes && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2 mt-1 flex gap-2">
          <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold text-primary uppercase tracking-wide">Sugestão da IA</div>
            <p className="text-[11px] text-foreground/80 leading-snug">{content.ai_notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldEditor({
  field, value, onChange, disabled, workspaceId, nodeId,
}: {
  field: SectionField;
  value: PrefillFieldValue | undefined;
  onChange: (next: PrefillFieldValue) => void;
  disabled?: boolean;
  workspaceId?: string;
  nodeId?: string;
}) {
  const origin: FieldOrigin = value?.origin ?? "empty";
  const meta = ORIGIN_META[origin];
  const Icon = meta.Icon;

  // Debounced edit handler — marca origin=edited e dispara onChange
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emit = useCallback(
    (raw: PrefillFieldValue["value"]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange({ value: raw, origin: "edited", citation: value?.citation });
      }, 350);
    },
    [onChange, value?.citation],
  );
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] font-medium text-foreground/90 flex items-center gap-1.5">
          {field.label}
          {field.decisionOnly && (
            <span className="text-[9px] text-muted-foreground font-mono" title="Decisão humana — IA não preenche">
              decisão
            </span>
          )}
        </Label>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={`text-[9px] ${meta.cls} flex items-center gap-1 px-1.5 py-0 shrink-0 cursor-help`}
              >
                <Icon className="h-2.5 w-2.5" />
                {meta.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" align="start" className="max-w-[260px] text-[11px] leading-snug">
              <p className="font-medium mb-1">{meta.label}</p>
              <p className="text-muted-foreground">{meta.tip}</p>
              {value?.citation && (
                <p className="mt-1.5 pt-1.5 border-t border-border text-foreground/80">
                  <span className="font-mono text-[10px] text-muted-foreground">fonte:</span> {value.citation}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {field.type === "text" && (
        <Input
          defaultValue={typeof value?.value === "string" ? value.value : ""}
          placeholder={field.hint}
          onChange={(e) => emit(e.target.value)}
          disabled={disabled}
          className="h-8 text-xs"
        />
      )}

      {field.type === "textarea" && (
        <Textarea
          defaultValue={typeof value?.value === "string" ? value.value : ""}
          placeholder={field.hint}
          onChange={(e) => emit(e.target.value)}
          disabled={disabled}
          rows={3}
          className="text-xs resize-y"
        />
      )}

      {field.type === "list" && (
        <ListEditor
          value={Array.isArray(value?.value) && typeof value?.value[0] !== "object"
            ? (value.value as string[]) : []}
          onChange={(arr) => emit(arr)}
          disabled={disabled}
          hint={field.hint}
        />
      )}

      {field.type === "kv" && (
        <KvEditor
          value={(value?.value && typeof value.value === "object" && !Array.isArray(value.value))
            ? (value.value as Record<string, string>) : {}}
          onChange={(kv) => emit(kv)}
          disabled={disabled}
          hint={field.hint}
        />
      )}

      {field.type === "checklist" && (
        <ChecklistEditor
          value={(Array.isArray(value?.value) && typeof value?.value[0] === "object"
            ? (value.value as Array<{ id: string; text: string; done: boolean }>) : [])}
          onChange={(items) => emit(items)}
          disabled={disabled}
          hint={field.hint}
        />
      )}

      {field.type === "attachments" && (
        workspaceId && nodeId ? (
          <AttachmentUploader
            workspaceId={workspaceId}
            nodeId={nodeId}
            attachments={Array.isArray(value?.value) && typeof value?.value[0] === "object" && (value!.value as Array<Record<string, unknown>>)[0]?.url !== undefined
              ? (value!.value as unknown as AttachmentItem[])
              : []}
            onChange={(next) => onChange({ value: next as unknown as PrefillFieldValue["value"], origin: "edited", citation: value?.citation })}
          />
        ) : (
          <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
            <Paperclip className="h-3 w-3" /> Anexos disponíveis após salvar o node.
          </p>
        )
      )}

      {value?.citation && (origin === "auto" || origin === "client") && (
        <p className="text-[9px] text-muted-foreground italic truncate">
          <span className="opacity-70">fonte:</span> {value.citation}
        </p>
      )}
    </div>
  );
}

// ─── List editor (string[]) ───────────────────────────────────────────────
function ListEditor({
  value, onChange, disabled, hint,
}: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean; hint?: string }) {
  const [items, setItems] = useState<string[]>(value);
  useEffect(() => setItems(value), [value]);
  const update = (next: string[]) => { setItems(next); onChange(next); };
  return (
    <div className="space-y-1.5">
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">{idx + 1}.</span>
          <Input
            value={it}
            onChange={(e) => {
              const next = [...items]; next[idx] = e.target.value; update(next);
            }}
            disabled={disabled}
            className="h-7 text-xs flex-1"
          />
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
            onClick={() => update(items.filter((_, i) => i !== idx))} disabled={disabled}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-muted-foreground"
        onClick={() => update([...items, ""])} disabled={disabled}>
        <Plus className="h-3 w-3" /> {hint ?? "Adicionar item"}
      </Button>
    </div>
  );
}

// ─── KV editor (Record<string,string>) ────────────────────────────────────
function KvEditor({
  value, onChange, disabled, hint,
}: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; disabled?: boolean; hint?: string }) {
  const [entries, setEntries] = useState<Array<[string, string]>>(Object.entries(value));
  useEffect(() => setEntries(Object.entries(value)), [value]);
  const update = (next: Array<[string, string]>) => {
    setEntries(next);
    onChange(Object.fromEntries(next.filter(([k]) => k.trim())));
  };
  return (
    <div className="space-y-1.5">
      {entries.map(([k, v], idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <Input
            value={k}
            placeholder="chave"
            onChange={(e) => { const next = [...entries] as Array<[string, string]>; next[idx] = [e.target.value, v]; update(next); }}
            disabled={disabled}
            className="h-7 text-xs w-1/3"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <Input
            value={v}
            placeholder="valor"
            onChange={(e) => { const next = [...entries] as Array<[string, string]>; next[idx] = [k, e.target.value]; update(next); }}
            disabled={disabled}
            className="h-7 text-xs flex-1"
          />
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
            onClick={() => update(entries.filter((_, i) => i !== idx))} disabled={disabled}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-muted-foreground"
        onClick={() => update([...entries, ["", ""]])} disabled={disabled}>
        <Plus className="h-3 w-3" /> {hint ?? "Adicionar par"}
      </Button>
    </div>
  );
}

// ─── Checklist editor ─────────────────────────────────────────────────────
function ChecklistEditor({
  value, onChange, disabled, hint,
}: { value: Array<{ id: string; text: string; done: boolean }>; onChange: (v: Array<{ id: string; text: string; done: boolean }>) => void; disabled?: boolean; hint?: string }) {
  const [items, setItems] = useState(value);
  useEffect(() => setItems(value), [value]);
  const update = (next: typeof items) => { setItems(next); onChange(next); };
  const uid = () => Math.random().toString(36).slice(2, 9);
  return (
    <div className="space-y-1.5">
      {items.map((it, idx) => (
        <div key={it.id} className="flex items-center gap-1.5">
          <Checkbox
            checked={it.done}
            onCheckedChange={(v) => { const next = [...items]; next[idx] = { ...it, done: !!v }; update(next); }}
            disabled={disabled}
          />
          <Input
            value={it.text}
            onChange={(e) => { const next = [...items]; next[idx] = { ...it, text: e.target.value }; update(next); }}
            disabled={disabled}
            className={`h-7 text-xs flex-1 ${it.done ? "line-through text-muted-foreground" : ""}`}
          />
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
            onClick={() => update(items.filter((_, i) => i !== idx))} disabled={disabled}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-muted-foreground"
        onClick={() => update([...items, { id: uid(), text: "", done: false }])} disabled={disabled}>
        <Plus className="h-3 w-3" /> {hint ?? "Adicionar item"}
      </Button>
    </div>
  );
}
