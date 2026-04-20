import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FolderKanban, LogOut, Settings, Brain } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/adminCheck";
import logo from "@/assets/logo-aceleriq.png";

const navItems = [
  { to: "/ops", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/ops/clients", icon: Users, label: "Clientes" },
  { to: "/ops/workspaces", icon: FolderKanban, label: "Workspaces" },
];

export default function AppTopNav() {
  const { logout, user, userRole } = useAuth();
  const location = useLocation();

  const renderItem = (
    to: string,
    Icon: typeof LayoutDashboard,
    label: string,
    end = false,
  ) => {
    const isActive = end
      ? location.pathname === to
      : location.pathname.startsWith(to);
    return (
      <NavLink
        key={to}
        to={to}
        end={end}
        className={`group inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </NavLink>
    );
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/85 backdrop-blur-md px-4 md:px-6">
      <div className="flex items-center gap-2 pr-2 mr-1 border-r border-border/60 h-8">
        <img src={logo} alt="Aceleriq" className="h-7" />
      </div>

      <nav className="flex items-center gap-1">
        <span className="hidden md:inline text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/60 mr-2">
          Operações
        </span>
        {navItems.map((i) => renderItem(i.to, i.icon, i.label, i.end))}
      </nav>

      {isAdmin(userRole) && (
        <nav className="ml-2 flex items-center gap-1 border-l border-border/60 pl-3">
          <span className="hidden md:inline text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/60 mr-2">
            Admin
          </span>
          {renderItem("/ops/ai", Brain, "IA")}
          {renderItem("/ops/settings", Settings, "Configurações", true)}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden sm:flex flex-col items-end leading-tight min-w-0 max-w-[180px]">
          <span className="truncate text-xs font-medium text-foreground">
            {user?.user_metadata?.full_name ?? user?.email?.split("@")[0]}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">{user?.email}</span>
        </div>
        <button
          onClick={logout}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
