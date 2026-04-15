import { FolderKanban } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export default function WorkspacesPage() {
  const navigate = useNavigate();

  return (
    <>
      <AppHeader title="Workspaces" subtitle="Áreas de trabalho dos clientes" />
      <EmptyState
        icon={FolderKanban}
        title="Nenhum workspace selecionado"
        description="Acesse um workspace a partir da lista de clientes."
      />
      <div className="flex justify-center -mt-12">
        <Button variant="outline" onClick={() => navigate("/ops/clients")}>
          Ir para Clientes
        </Button>
      </div>
    </>
  );
}
