import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FolderKanban, Settings, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo-aceleriq.png";
import { PORTAL_MODE, subscribeBridgeError, type BridgeErrorState } from "@/v2/data/portalClient";

const NAV = [
  { title: "Dashboard", url: "/ops-v2", icon: LayoutDashboard, end: true },
  { title: "Clientes", url: "/ops-v2/clientes", icon: Users },
  { title: "Projetos", url: "/ops-v2/projetos", icon: FolderKanban },
  { title: "Configurações", url: "/ops-v2/configuracoes", icon: Settings },
];

function initials(name?: string | null, email?: string | null) {
  const src = (name && name.trim()) || (email ? email.split("@")[0] : "");
  if (!src) return "AC";
  return src.split(/[\s._-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function TopNavV2() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<BridgeErrorState | null>(null);

  useEffect(() => subscribeBridgeError(setErr), []);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  useEffect(() => { setMobileOpen(false); setUserOpen(false); }, [location.pathname]);

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? null;

  const badge =
    PORTAL_MODE === "mock"
      ? { label: "demo", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" }
      : err
      ? { label: "bridge · erro", cls: "border-destructive/50 bg-destructive/10 text-destructive" }
      : { label: "bridge", cls: "border-primary/40 bg-primary/10 text-primary" };

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 h-[80px] flex items-center px-4 sm:px-6 gap-4 text-foreground border-b border-border/50"
        style={{
          background: "hsl(var(--card) / 0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 1px 16px rgba(0,0,0,0.25)",
        }}
      >
        <div className="flex items-center shrink-0 gap-2">
          <img src={logo} alt="Aceleriq" className="h-24 w-auto -my-4" />
          <span className="rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            OPS V2
          </span>
        </div>

        <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {NAV.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "relative inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="h-3.5 w-3.5" />
                  {item.title}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="flex-1 md:hidden" />

        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("hidden sm:inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider", badge.cls)}>
            {badge.label}
          </span>

          <div className="relative" ref={userRef}>
            <button onClick={() => setUserOpen((v) => !v)} aria-label="Conta">
              <Avatar className="w-8 h-8 cursor-pointer">
                <AvatarFallback className="bg-primary/15 text-primary text-[11px] font-semibold">
                  {initials(fullName, user?.email)}
                </AvatarFallback>
              </Avatar>
            </button>
            {userOpen && (
              <div className="absolute top-full right-0 mt-2 w-56 rounded-xl bg-popover border border-border p-1.5 shadow-lg animate-fade-in">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {fullName ?? user?.email?.split("@")[0]}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => { setUserOpen(false); logout(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sair
                </button>
              </div>
            )}
          </div>

          <button
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-background/90 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-x-0 top-[60px] mx-3 rounded-xl bg-popover border border-border p-3 shadow-lg animate-fade-in">
            {NAV.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors",
                    isActive ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <item.icon className="w-4 h-4" />
                {item.title}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
