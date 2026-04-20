import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface CanvasGroupData extends Record<string, unknown> {
  title: string;
  childCount: number;
}

function CanvasGroupNodeComp({ data, selected }: NodeProps) {
  const d = data as CanvasGroupData;
  return (
    <div
      className={`relative rounded-xl border-2 border-dashed border-border bg-muted/10 backdrop-blur-sm transition-all ${
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
      style={{ width: "100%", height: "100%" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted/10 !w-2 !h-2 !border-background" />
      <div className="absolute -top-3 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/10 border border-border">
        <Building2 className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</span>
      </div>
      <div className="absolute top-2 right-2">
        <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
          {d.childCount} item{d.childCount === 1 ? "" : "s"}
        </Badge>
      </div>
      <div className="px-3 pt-5 pb-2">
        <p className="text-sm font-semibold text-muted-foreground truncate">{d.title}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted/10 !w-2 !h-2 !border-background" />
    </div>
  );
}

export default memo(CanvasGroupNodeComp);
