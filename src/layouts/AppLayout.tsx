import { Outlet } from "react-router-dom";
import AppTopNav from "@/components/AppTopNav";
import { usePortalAutoSync } from "@/hooks/usePortalAutoSync";

export default function AppLayout() {
  usePortalAutoSync(60_000);
  return (
    <div className="tech-grid-bg min-h-screen flex flex-col">
      <AppTopNav />
      <main className="relative flex-1 pt-[80px]">
        <Outlet />
      </main>
    </div>
  );
}
