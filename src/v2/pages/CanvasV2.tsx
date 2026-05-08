import { useParams } from "react-router-dom";
import HeaderV2 from "@/v2/components/HeaderV2";
import EmptyState from "@/components/EmptyState";
import { Workflow } from "lucide-react";

export default function CanvasV2() {
  const { projectId } = useParams();
  return (
    <>
      <HeaderV2 title="Canvas" subtitle={`Projeto ${projectId} — selecione um milestone`} />
      <div className="px-8 py-6">
        <EmptyState
          icon={Workflow}
          title="Canvas em construção"
          description="Seleção obrigatória de milestone e nodes leves chegam na Fase V2.2."
        />
      </div>
    </>
  );
}
