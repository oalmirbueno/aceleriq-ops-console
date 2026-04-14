import { useParams } from "react-router-dom";
import { FolderKanban } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import EmptyState from "@/components/EmptyState";

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams();

  return (
    <>
      <AppHeader
        title={`Workspace ${workspaceId ?? ""}`}
        subtitle="Detalhes do workspace"
      />
      <EmptyState
        icon={FolderKanban}
        title="Workspace vazio"
        description="Conecte o backend para carregar os dados deste workspace."
      />
    </>
  );
}
