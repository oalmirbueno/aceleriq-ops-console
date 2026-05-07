import { Outlet } from "react-router-dom";
import AppTopNav from "@/components/AppTopNav";
import { usePortalAutoSync } from "@/hooks/usePortalAutoSync";
import { featureFlags } from "@/config/featureFlags";

export default function AppLayout() {
  // Modo operação limpa: auto-sync global desligado por feature flag.
  usePortalAutoSync(60_000, featureFlags.enableAutoPortalSync);
  return (
    <div className="tech-grid-bg min-h-screen flex flex-col">
      <AppTopNav />
      <main className="relative flex-1 pt-[80px]">
        <Outlet />
      </main>
    </div>
  );
}
