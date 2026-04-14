import { FolderKanban } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import EmptyState from "@/components/EmptyState";

export default function WorkspacesPage() {
  return (
    <>
      <AppHeader title="Workspaces" subtitle="Áreas de trabalho dos clientes" />
      <EmptyState
        icon={FolderKanban}
        title="Nenhum workspace encontrado"
        description="Conecte o backend para visualizar os workspaces."
      />
    </>
  );
}
