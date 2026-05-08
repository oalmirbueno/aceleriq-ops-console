import HeaderV2 from "@/v2/components/HeaderV2";
import EmptyState from "@/components/EmptyState";
import { Settings } from "lucide-react";

export default function SettingsV2() {
  return (
    <>
      <HeaderV2 title="Configurações" subtitle="Modo Dev e ferramentas técnicas" />
      <div className="px-8 py-6">
        <EmptyState
          icon={Settings}
          title="Configurações em construção"
          description="Hub de Modo Dev e ferramentas técnicas chega na Fase V2.5."
        />
      </div>
    </>
  );
}
