import HeaderV2 from "@/v2/components/HeaderV2";
import EmptyState from "@/components/EmptyState";
import { LayoutDashboard } from "lucide-react";

export default function DashboardV2() {
  return (
    <>
      <HeaderV2 title="Dashboard" subtitle="Visão geral da operação" />
      <div className="px-8 py-6">
        <EmptyState
          icon={LayoutDashboard}
          title="Dashboard em construção"
          description="KPIs de clientes, projetos, milestones e tarefas chegam na Fase V2.1."
        />
      </div>
    </>
  );
}
