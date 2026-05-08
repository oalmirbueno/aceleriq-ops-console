import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FolderKanban, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo-aceleriq.png";

const NAV = [
  { to: "/ops-v2", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/ops-v2/clientes", icon: Users, label: "Clientes" },
  { to: "/ops-v2/projetos", icon: FolderKanban, label: "Projetos" },
];

export default function SidebarV2() {
  const { logout, user } = useAuth();
  const location = useLocation();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-background">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <img src={logo} alt="Aceleriq" className="h-7" />
        <span className="rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          V2
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="label-sm mb-3 px-2">OPERAÇÃO</p>
        {NAV.map(({ to, icon: Icon, label, end }) => {
          const active = end ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}

        <p className="label-sm mt-6 mb-3 px-2">SISTEMA</p>
        <NavLink
          to="/ops-v2/configuracoes"
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
            location.pathname.startsWith("/ops-v2/configuracoes")
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <Settings className="h-4 w-4" />
          Configurações
        </NavLink>
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              {user?.user_metadata?.full_name ?? user?.email?.split("@")[0]}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}