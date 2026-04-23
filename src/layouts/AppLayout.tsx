import { Outlet } from "react-router-dom";
import AppTopNav from "@/components/AppTopNav";

export default function AppLayout() {
  return (
    <div className="tech-grid-bg min-h-screen flex flex-col">
      <AppTopNav />
      <main className="relative flex-1 pt-[52px]">
        <Outlet />
      </main>
    </div>
  );
}
