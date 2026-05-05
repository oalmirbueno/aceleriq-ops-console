import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FolderKanban, LogOut, Settings, Brain, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/adminCheck";
import logo from "@/assets/logo-aceleriq.png";

const navItems = [
  { to: "/ops", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/ops/clients", icon: Users, label: "Clientes" },
  { to: "/ops/workspaces", icon: FolderKanban, label: "Workspaces" },
];

export default function AppSidebar() {
  const { logout, user, userRole } = useAuth();
  const location = useLocation();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <img src={logo} alt="Aceleriq" className="h-8" />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="label-sm mb-3 px-2">OPERAÇÕES</p>
        {navItems.map(({ to, icon: Icon, label, end }) => {
          const isActive = end
            ? location.pathname === to
            : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}

        {isAdmin(userRole) && (
          <>
            <p className="label-sm mt-6 mb-3 px-2">ADMIN</p>
            <NavLink
              to="/ops/ai"
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                location.pathname.startsWith("/ops/ai")
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Brain className="h-4 w-4" />
              Inteligência Artificial
            </NavLink>
            <NavLink
              to="/ops/sync-logs"
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                location.pathname.startsWith("/ops/sync-logs")
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Activity className="h-4 w-4" />
              Logs de sync
            </NavLink>
            <NavLink
              to="/ops/settings"
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                location.pathname === "/ops/settings"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Settings className="h-4 w-4" />
              Configurações
            </NavLink>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{user?.user_metadata?.full_name ?? user?.email?.split("@")[0]}</p>
            <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
