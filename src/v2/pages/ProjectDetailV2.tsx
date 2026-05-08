import { useEffect } from "react";
import { useParams, NavLink, Outlet, useLocation, Link } from "react-router-dom";
import HeaderV2 from "@/v2/components/HeaderV2";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";

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
  const { data: project, loading, error } = usePortalQuery(
    () => projectId ? portalClient.getProject(projectId) : Promise.resolve(null),
    [projectId],
  );

  // Prefetch paralelo: aquece o cache para que trocar de aba seja instantâneo.
  useEffect(() => {
    if (!projectId) return;
    portalClient.listMilestones(projectId).catch(() => {});
    portalClient.listBriefings({ projectId }).catch(() => {});
  }, [projectId]);

  // Quando milestones chegarem, pré-carrega tasks do milestone atual/primeiro.
  useEffect(() => {
    if (!projectId || !project) return;
    portalClient.listMilestones(projectId).then((ms) => {
      const id = project.currentMilestoneId || ms[0]?.id;
      if (id) portalClient.listTasks({ projectId, milestoneId: id }).catch(() => {});
    }).catch(() => {});
  }, [projectId, project]);

  if (!loading && !error && project === null) {
    return (
      <>
        <HeaderV2 title="Projeto não encontrado" subtitle={projectId} />
        <div className="px-2 py-10 max-w-2xl">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-5">
            <p className="text-sm font-medium text-destructive">Projeto inexistente no Portal</p>
            <p className="text-xs text-destructive/80 mt-1">
              ID <code className="font-mono">{projectId}</code> não existe entre os projetos ativos do Portal.
              Pode ter sido arquivado, removido, ou é um ID antigo/mock.
            </p>
            <Link to="/ops-v2/projetos" className="mt-4 inline-flex text-xs underline text-destructive">
              Voltar para Projetos
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <HeaderV2
        title={project?.name ?? "Projeto"}
        subtitle={project ? `${project.clientName} · ${Math.round(project.progress * 100)}%` : projectId}
      />
      <div className="border-b border-border">
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
      <div className="py-6">
        <Outlet />
      </div>
    </>
  );
}
