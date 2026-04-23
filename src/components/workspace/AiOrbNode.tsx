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
      <Handle type="target" position={Position.Left} className="ai-orb-handle" />
      <Handle type="target" position={Position.Top} className="ai-orb-handle" />
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
      <Handle type="source" position={Position.Right} className="ai-orb-handle" />
      <Handle type="source" position={Position.Bottom} className="ai-orb-handle" />
    </div>
  );
}

export default memo(AiOrbNodeComp);