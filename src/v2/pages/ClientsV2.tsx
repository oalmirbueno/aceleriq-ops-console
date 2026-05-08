import HeaderV2 from "@/v2/components/HeaderV2";
import EmptyState from "@/components/EmptyState";
import { Users } from "lucide-react";

export default function ClientsV2() {
  return (
    <>
      <HeaderV2 title="Clientes" subtitle="Lista enxuta com projeto e milestone atual" />
      <div className="px-8 py-6">
        <EmptyState
          icon={Users}
          title="Lista de clientes em construção"
          description="Conexão com o Portal será habilitada na Fase V2.1."
        />
      </div>
    </>
  );
}
