import { Outlet } from "react-router-dom";
import AppTopNav from "@/components/AppTopNav";

export default function AppLayout() {
  return (
    <div className="tech-grid-bg flex h-screen flex-col overflow-hidden">
      <AppTopNav />
      <main className="relative flex flex-1 flex-col overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
