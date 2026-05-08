import HeaderV2 from "@/v2/components/HeaderV2";
import EmptyState from "@/components/EmptyState";
import { FolderKanban } from "lucide-react";

export default function ProjectsV2() {
  return (
    <>
      <HeaderV2 title="Projetos" subtitle="Projetos ativos vindos do Portal" />
      <div className="px-8 py-6">
        <EmptyState
          icon={FolderKanban}
          title="Lista de projetos em construção"
          description="Conexão com o Portal será habilitada na Fase V2.1."
        />
      </div>
    </>
  );
}
