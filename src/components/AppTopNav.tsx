import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, FolderKanban, LogOut, Settings, Brain,
  MoreHorizontal, Menu, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/adminCheck";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo-aceleriq.png";

interface NavItem {
  title: string;
  url: string;
  icon: React.FC<{ className?: string }>;
  end?: boolean;
}

const mainNav: NavItem[] = [
  { title: "Dashboard", url: "/ops", icon: LayoutDashboard, end: true },
  { title: "Clientes", url: "/ops/clients", icon: Users },
  { title: "Workspaces", url: "/ops/workspaces", icon: FolderKanban },
];

const adminNav: NavItem[] = [
  { title: "IA", url: "/ops/ai", icon: Brain },
  { title: "Configurações", url: "/ops/settings", icon: Settings, end: true },
];

function initialsFor(name?: string | null, email?: string | null): string {
  const src = (name && name.trim()) || (email ? email.split("@")[0] : "");
  if (!src) return "AC";
  return src
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AppTopNav() {
  const { user, userRole, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const showAdmin = isAdmin(userRole);
  const moreItems = showAdmin ? adminNav : [];
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? null;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
    setUserOpen(false);
  }, [location.pathname]);

  const linkBase =
    "relative px-3 py-1.5 text-[13px] rounded-md transition-colors";
  const linkInactive = "text-muted-foreground hover:text-foreground";
  const linkActive = "text-foreground";

  return (
    <>
      <nav
        className="fixed top-3 left-1/2 -translate-x-1/2 w-[95%] max-w-[1400px] z-50 h-[64px] rounded-xl flex items-center px-4 gap-4 text-foreground"
        style={{
          background: "hsl(var(--card) / 0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid hsl(var(--border) / 0.6)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center shrink-0">
          <img src={logo} alt="Aceleriq" className="h-14 w-auto" />
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {mainNav.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.end}
              className={({ isActive }) =>
                cn(linkBase, isActive ? linkActive : linkInactive)
              }
            >
              {({ isActive }) => (
                <>
                  {item.title}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </>
              )}
            </NavLink>
          ))}

          {moreItems.length > 0 && (
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className="px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md"
                aria-label="Mais"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {moreOpen && (
                <div
                  className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-52 rounded-xl bg-popover border border-border p-1.5 shadow-lg animate-fade-in"
                  style={{ transformOrigin: "top center" }}
                >
                  {moreItems.map((item) => (
                    <NavLink
                      key={item.url}
                      to={item.url}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors",
                          isActive
                            ? "text-foreground bg-secondary"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                        )
                      }
                    >
                      <item.icon className="w-3.5 h-3.5" />
                      {item.title}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile spacer */}
        <div className="flex-1 md:hidden" />

        {/* Right cluster */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative" ref={userRef}>
            <button onClick={() => setUserOpen((v) => !v)} aria-label="Conta">
              <Avatar className="w-7 h-7 cursor-pointer">
                <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                  {initialsFor(fullName, user?.email)}
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
                  onClick={() => {
                    setUserOpen(false);
                    logout();
                  }}
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

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-background/90 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-x-0 top-[68px] mx-3 rounded-xl bg-popover border border-border p-3 shadow-lg animate-fade-in">
            {[...mainNav, ...moreItems].map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors",
                    isActive
                      ? "text-foreground bg-secondary"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <item.icon className="w-4 h-4" />
                {item.title}
              </NavLink>
            ))}
            <div className="border-t border-border mt-2 pt-2">
              <button
                onClick={() => {
                  setMobileOpen(false);
                  logout();
                }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[13px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
