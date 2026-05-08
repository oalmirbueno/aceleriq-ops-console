import { useParams, NavLink, Outlet, useLocation } from "react-router-dom";
import HeaderV2 from "@/v2/components/HeaderV2";

const TABS = [
  { to: "", label: "Visão geral", end: true },
  { to: "milestones", label: "Milestones" },
  { to: "tarefas", label: "Tarefas" },
  { to: "canvas", label: "Canvas" },
  { to: "contexto", label: "Contexto" },
  { to: "arquivos", label: "Arquivos" },
  { to: "historico", label: "Histórico" },
];

export default function ProjectDetailV2() {
  const { projectId } = useParams();
  const location = useLocation();
  const base = `/ops-v2/projetos/${projectId}`;

  return (
    <>
      <HeaderV2 title="Projeto" subtitle={projectId} />
      <div className="border-b border-border px-8">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const to = t.to === "canvas" ? `${base}/canvas` : t.to ? `${base}/${t.to}` : base;
            const active = t.end ? location.pathname === to : location.pathname.startsWith(to);
            return (
              <NavLink
                key={t.to || "overview"}
                to={to}
                end={t.end}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors ${
                  active
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
      <div className="px-8 py-6">
        <Outlet />
      </div>
    </>
  );
}
