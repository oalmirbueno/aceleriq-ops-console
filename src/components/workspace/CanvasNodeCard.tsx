import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCanvasTypeConfig, getCanvasStatusConfig } from "./canvasConstants";

export interface CanvasNodeData extends Record<string, unknown> {
  title: string;
  node_type: string;
  status: string;
  description: string | null;
  hasLinkedEntity: boolean;
}

function CanvasNodeCardComp({ data, selected }: NodeProps) {
  const d = data as CanvasNodeData;
  const typeCfg = getCanvasTypeConfig(d.node_type);
  const statusCfg = getCanvasStatusConfig(d.status);
  const Icon = typeCfg.icon;

  return (
    <div
      className={`relative rounded-lg border-2 ${typeCfg.color} ${typeCfg.bg} px-3 py-2 min-w-[180px] max-w-[220px] shadow-sm transition-all ${
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-2 !h-2 !border-background" />

      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[10px] uppercase tracking-wide opacity-80">{typeCfg.label}</span>
        {d.hasLinkedEntity && (
          <Link2 className="h-3 w-3 ml-auto opacity-70" />
        )}
      </div>

      <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{d.title}</p>

      <div className="flex items-center gap-1 mt-2">
        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusCfg.color}`}>
          {statusCfg.label}
        </Badge>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2 !border-background" />
    </div>
  );
}

export default memo(CanvasNodeCardComp);
