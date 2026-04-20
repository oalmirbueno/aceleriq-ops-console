/**
 * NodeMethodChecklist
 *
 * Checklist do método ACELERA — passos fixos por tipo de node, sempre presentes.
 * Serve como guia: "se você fez esses 4-6 passos, esse node está bem entregue".
 * Estado persiste em canvas_nodes.metadata.prefill.method_state.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ListChecks } from "lucide-react";
import type { MethodChecklistItem } from "../nodeBlueprints";
import type { MethodChecklistState } from "../nodePrefillTypes";

interface Props {
  items: MethodChecklistItem[];
  state: MethodChecklistState;
  onToggle: (itemId: string, done: boolean) => void;
  disabled?: boolean;
}

export default function NodeMethodChecklist({ items, state, onToggle, disabled }: Props) {
  const doneCount = items.filter((i) => state[i.id]?.done).length;
  const requiredItems = items.filter((i) => i.required);
  const requiredDone = requiredItems.filter((i) => state[i.id]?.done).length;
  const allRequiredDone = requiredDone === requiredItems.length;

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5 text-primary" />
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Método (passos do tipo)
          </h4>
        </div>
        <Badge
          variant="outline"
          className={`text-[10px] ${
            allRequiredDone
              ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
              : "border-border text-muted-foreground"
          }`}
        >
          {doneCount}/{items.length}
          {allRequiredDone && <CheckCircle2 className="h-2.5 w-2.5 ml-1 inline" />}
        </Badge>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const checked = !!state[item.id]?.done;
          return (
            <li key={item.id} className="flex items-start gap-2 group">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => onToggle(item.id, !!v)}
                disabled={disabled}
                className="mt-0.5"
                aria-label={item.label}
              />
              <label
                className={`text-xs leading-tight cursor-pointer flex-1 ${
                  checked ? "line-through text-muted-foreground" : "text-foreground"
                }`}
                onClick={() => !disabled && onToggle(item.id, !checked)}
              >
                {item.label}
                {item.required && (
                  <span className="ml-1 text-[9px] text-amber-400 font-mono">*</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      {!allRequiredDone && (
        <p className="text-[10px] text-muted-foreground mt-2 italic">
          * itens obrigatórios pra considerar este node entregue
        </p>
      )}
    </div>
  );
}
