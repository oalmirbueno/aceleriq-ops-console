import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";

export default function AppLayout() {
  return (
    <div className="tech-grid-bg flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="relative flex flex-1 flex-col overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
