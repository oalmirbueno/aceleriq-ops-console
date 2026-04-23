import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, BrainCircuit, FileText, Gauge, Network, Sparkles } from "lucide-react";

export type AiOrbType = "planner" | "docs" | "content" | "tech" | "proof" | "full";

export interface AiOrbNodeData extends Record<string, unknown> {
  orbType: AiOrbType;
  label: string;
  specialization: string;
  isGenerating?: boolean;
}

const orbIcons = {
  planner: BrainCircuit,
  docs: FileText,
  content: Sparkles,
  tech: Network,
  proof: Gauge,
  full: Bot,
} satisfies Record<AiOrbType, typeof Bot>;

function AiOrbNodeComp({ data, selected }: NodeProps) {
  const d = data as AiOrbNodeData;
  const Icon = orbIcons[d.orbType] ?? Bot;
  const generating = !!d.isGenerating;

  return (
    <div className={`ai-orb-node ai-orb-${d.orbType} ${selected ? "is-selected" : ""} ${generating ? "is-generating" : ""}`}>
      {/* Handles múltiplos — 2 por lado = 8 total */}
      <Handle type="target" position={Position.Left}   id="l1" className="ai-orb-handle" style={{ top: "40%" }} />
      <Handle type="target" position={Position.Left}   id="l2" className="ai-orb-handle" style={{ top: "60%" }} />
      <Handle type="target" position={Position.Top}    id="t1" className="ai-orb-handle" style={{ left: "40%" }} />
      <Handle type="target" position={Position.Top}    id="t2" className="ai-orb-handle" style={{ left: "60%" }} />
      <div className="ai-orb-shell" aria-label={d.label}>
        <span className="ai-orb-ring" />
        <span className="ai-orb-pulse" />
        <span className="ai-orb-particle particle-one" />
        <span className="ai-orb-particle particle-two" />
        <span className="ai-orb-particle particle-three" />
        <span className="ai-orb-core">
          <Icon className="h-5 w-5" strokeWidth={1.8} />
          <span>{generating ? "gerando..." : d.label}</span>
        </span>
      </div>
      <p className="ai-orb-caption">{d.specialization}</p>
      <Handle type="source" position={Position.Right}  id="r1" className="ai-orb-handle" style={{ top: "40%" }} />
      <Handle type="source" position={Position.Right}  id="r2" className="ai-orb-handle" style={{ top: "60%" }} />
      <Handle type="source" position={Position.Bottom} id="b1" className="ai-orb-handle" style={{ left: "40%" }} />
      <Handle type="source" position={Position.Bottom} id="b2" className="ai-orb-handle" style={{ left: "60%" }} />
    </div>
  );
}

export default memo(AiOrbNodeComp);