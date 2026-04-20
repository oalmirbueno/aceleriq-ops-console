/**
 * NodeQuickActions
 *
 * Renderiza os botões de ação rápida do header do drawer, baseado no blueprint.
 * O parent fornece um handler por id de ação; ações sem handler ficam desabilitadas.
 */
import { Button } from "@/components/ui/button";
import {
  Sparkles, Download, ListChecks, CheckCircle2, RefreshCw,
  FileText, BarChart3, Target, Link2, Calendar, Rocket,
  type LucideIcon,
} from "lucide-react";
import type { NodeQuickAction, QuickActionId } from "../nodeBlueprints";

const ACTION_ICONS: Record<QuickActionId, LucideIcon> = {
  generate_tasks:     ListChecks,
  export_pdf:         Download,
  approve:            CheckCircle2,
  regenerate_prefill: RefreshCw,
  open_briefing:      FileText,
  create_snapshot:    BarChart3,
  create_front:       Target,
  link_asset:         Link2,
  schedule_meeting:   Calendar,
  go_live:            Rocket,
};

interface Props {
  actions: NodeQuickAction[];
  /** Map de id → handler. Ações sem handler ficam desabilitadas (informativo) */
  handlers: Partial<Record<QuickActionId, () => void | Promise<void>>>;
  /** Map de id → loading individual */
  loading?: Partial<Record<QuickActionId, boolean>>;
  disabled?: boolean;
}

export default function NodeQuickActions({ actions, handlers, loading = {}, disabled }: Props) {
  if (actions.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {actions.map((action) => {
        const Icon = ACTION_ICONS[action.id] ?? Sparkles;
        const handler = handlers[action.id];
        const isLoading = !!loading[action.id];
        return (
          <Button
            key={action.id}
            size="sm"
            variant={action.primary ? "default" : "outline"}
            onClick={handler}
            disabled={disabled || !handler || isLoading}
            className="h-7 text-[11px] gap-1 px-2.5"
            title={!handler ? "Ainda não implementado" : action.label}
          >
            {isLoading ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Icon className="h-3 w-3" />
            )}
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
