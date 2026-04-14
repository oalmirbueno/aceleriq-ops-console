import { Users } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import EmptyState from "@/components/EmptyState";

export default function ClientsPage() {
  return (
    <>
      <AppHeader title="Clientes" subtitle="Gestão de clientes da operação" />
      <EmptyState
        icon={Users}
        title="Nenhum cliente cadastrado"
        description="Conecte o backend para visualizar os clientes."
      />
    </>
  );
}
