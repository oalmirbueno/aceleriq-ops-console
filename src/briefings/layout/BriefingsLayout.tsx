import { Link, Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export default function BriefingsLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <Link to="/briefings" className="flex items-center gap-2 group">
            <span className="h-7 w-7 rounded-md bg-primary/10 border border-primary/30 grid place-items-center">
              <span className="h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-medium tracking-tight">Central de Briefings</span>
          </Link>
          <div className="flex items-center gap-3">
            {user?.email && (
              <span className="text-xs text-muted-foreground hidden sm:inline">{user.email}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { logout(); navigate("/login"); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}