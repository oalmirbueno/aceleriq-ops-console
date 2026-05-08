import { Outlet } from "react-router-dom";
import TopNavV2 from "@/v2/components/TopNavV2";
import BridgeErrorBanner from "@/v2/components/BridgeErrorBanner";

export default function AppLayoutV2() {
  return (
    <div className="tech-grid-bg min-h-screen flex flex-col">
      <TopNavV2 />
      <main className="relative flex-1 pt-[80px]">
        <BridgeErrorBanner />
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}