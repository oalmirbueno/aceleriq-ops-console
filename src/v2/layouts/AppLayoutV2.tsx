import { Outlet } from "react-router-dom";
import SidebarV2 from "@/v2/components/SidebarV2";
import BridgeErrorBanner from "@/v2/components/BridgeErrorBanner";

export default function AppLayoutV2() {
  return (
    <div className="flex min-h-screen bg-background">
      <SidebarV2 />
      <main className="flex-1 min-w-0">
        <BridgeErrorBanner />
        <Outlet />
      </main>
    </div>
  );
}